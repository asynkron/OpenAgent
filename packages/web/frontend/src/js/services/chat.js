import { createMarkdownDisplay } from '../components/markdown_display.js';
import { createPlanDisplay } from '../components/plan_display.js';

const globalScope = typeof window !== 'undefined' ? window : globalThis;
const markedLib = globalScope?.marked;
const hljsLib = globalScope?.hljs;

export function createChatService(options = {}) {
    const {
        panel,
        startContainer,
        startForm,
        startInput,
        chatContainer,
        chatBody,
        messageList,
        chatForm,
        chatInput,
        planContainer,
        statusElement,
        reconnectDelay = 2000,
    } = options;

    if (!panel) {
        return null;
    }

    const cleanupFns = [];
    const pendingMessages = [];
    const scrollContainer = chatBody || messageList;
    const sendButtons = [];
    const planDisplay = createPlanDisplay({ container: planContainer });
    if (startForm) {
        const button = startForm.querySelector('button[type="submit"]');
        if (button && !sendButtons.includes(button)) {
            sendButtons.push(button);
        }
    }
    if (chatForm) {
        const button = chatForm.querySelector('button[type="submit"]');
        if (button && !sendButtons.includes(button)) {
            sendButtons.push(button);
        }
    }
    let socket = null;
    let reconnectTimer = null;
    let destroyed = false;
    let hasConversation = false;
    let isConnected = false;
    let isThinking = false;
    let lastStatus = '';
    let lastStatusLevel = '';
    let thinkingMessage = null;

    const approvalSuppressionPhrases = [
        'approve running this command?',
        'approved and added to session approvals.',
        'command approved for the remainder of the session.',
    ];

    function scrollToLatest() {
        if (!scrollContainer) {
            return;
        }
        window.requestAnimationFrame(() => {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
    }

    function updateStatusDisplay() {
        if (!statusElement) {
            return;
        }
        const message = lastStatus;
        statusElement.textContent = message || '';
        if (isThinking) {
            statusElement.dataset.level = 'info';
            statusElement.dataset.thinking = 'true';
        } else {
            if (lastStatusLevel) {
                statusElement.dataset.level = lastStatusLevel;
            } else {
                delete statusElement.dataset.level;
            }
            statusElement.dataset.thinking = 'false';
        }
    }

    function setStatus(message, { level } = {}) {
        lastStatus = typeof message === 'string' ? message : '';
        lastStatusLevel = typeof level === 'string' ? level : '';
        if (!isThinking) {
            updateStatusDisplay();
        }
    }

    // Render a lightweight placeholder while the agent prepares a response.
    function ensureThinkingMessage() {
        if (!messageList || thinkingMessage) {
            return;
        }

        ensureConversationStarted();

        const wrapper = document.createElement('div');
        wrapper.className = 'agent-message agent-message--agent agent-message--thinking';

        const bubble = document.createElement('div');
        bubble.className = 'agent-message-bubble agent-message-bubble--thinking';
        bubble.setAttribute('aria-live', 'polite');

        const indicator = document.createElement('div');
        indicator.className = 'agent-thinking-indicator';

        const text = document.createElement('span');
        text.className = 'agent-thinking-text';
        text.textContent = 'Preparing response';
        indicator.appendChild(text);

        const dots = document.createElement('span');
        dots.className = 'agent-thinking-dots';
        for (let index = 0; index < 3; index += 1) {
            const dot = document.createElement('span');
            dot.className = 'agent-thinking-dot';
            dots.appendChild(dot);
        }
        indicator.appendChild(dots);

        bubble.appendChild(indicator);
        wrapper.appendChild(bubble);
        messageList.appendChild(wrapper);

        thinkingMessage = wrapper;
        scrollToLatest();
    }

    function removeThinkingMessage() {
        if (thinkingMessage?.parentElement) {
            thinkingMessage.parentElement.removeChild(thinkingMessage);
        }
        thinkingMessage = null;
    }

    function updateThinkingState(next) {
        const active = Boolean(next);
        if (active) {
            ensureThinkingMessage();
        } else {
            removeThinkingMessage();
        }
        if (isThinking === active) {
            return;
        }
        isThinking = active;
        sendButtons.forEach((button) => {
            button.disabled = active;
        });
        updateStatusDisplay();
    }

    function normaliseText(value) {
        if (typeof value === 'string') {
            return value;
        }
        if (value == null) {
            return '';
        }
        try {
            return String(value);
        } catch (error) {
            console.warn('Failed to normalise agent text', error);
            return '';
        }
    }

    function toComparableText(value) {
        const normalised = normaliseText(value);
        if (!normalised) {
            return '';
        }
        return normalised.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function isApprovalText(value) {
        const comparable = toComparableText(value);
        if (!comparable) {
            return false;
        }
        return approvalSuppressionPhrases.some((phrase) => comparable.includes(phrase));
    }

    function isApprovalNotification(payload = {}) {
        if (!payload || typeof payload !== 'object') {
            return false;
        }

        const fields = [
            payload.text,
            payload.title,
            payload.subtitle,
            payload.description,
            payload.details,
            payload.prompt,
        ];

        if (payload.metadata && typeof payload.metadata === 'object') {
            fields.push(payload.metadata.scope);
        }

        return fields.some((value) => isApprovalText(value));
    }

    function updatePanelState() {
        const active = hasConversation;
        panel.classList.toggle('agent-panel--empty', !active);
        if (startContainer) {
            startContainer.classList.toggle('hidden', active);
        }
        if (chatContainer) {
            chatContainer.classList.toggle('hidden', !active);
        }
        if (active && chatInput) {
            window.requestAnimationFrame(() => {
                chatInput.focus();
                autoResize(chatInput);
            });
        }
    }

    function ensureConversationStarted() {
        if (hasConversation) {
            return;
        }
        hasConversation = true;
        updatePanelState();
    }

    function autoResize(textarea) {
        if (!textarea) {
            return;
        }
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
    }

    function clearReconnectTimer() {
        if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function scheduleReconnect() {
        if (reconnectTimer || destroyed) {
            return;
        }
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, reconnectDelay);
    }

    function flushPending() {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }
        while (pendingMessages.length > 0) {
            const next = pendingMessages[0];
            try {
                socket.send(JSON.stringify({ type: 'prompt', prompt: next }));
                pendingMessages.shift();
            } catch (error) {
                console.warn('Failed to deliver chat message', error);
                scheduleReconnect();
                break;
            }
        }
    }

    function appendMessage(role, text) {
        if (!messageList || typeof text !== 'string' || !text) {
            return;
        }

        ensureConversationStarted();

        const wrapper = document.createElement('div');
        wrapper.className = `agent-message agent-message--${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'agent-message-bubble';

        if (role === 'agent') {
            const markdownDisplay = createMarkdownDisplay({
                content: bubble,
                getCurrentFile: () => null,
                setCurrentContent: () => {},
                buildQuery: () => '',
            });
            markdownDisplay.render(text, { updateCurrent: false });
        } else {
            bubble.textContent = text;
        }

        wrapper.appendChild(bubble);
        messageList.appendChild(wrapper);

        scrollToLatest();
    }

    function appendEvent(eventType, payload = {}) {
        if (!messageList) {
            return;
        }

        const text = normaliseText(payload.text).trim();
        const title = normaliseText(payload.title).trim();
        const subtitle = normaliseText(payload.subtitle).trim();
        const description = normaliseText(payload.description).trim();
        const details = normaliseText(payload.details).trim();

        if (isApprovalNotification({
            text,
            title,
            subtitle,
            description,
            details,
        })) {
            return;
        }

        if (eventType === 'request-input') {
            return;
        }

        let headerText = title;
        let bodyText = '';

        const fallbackTitles = {
            banner: title || text || 'Agent banner',
            status: title || 'Status update',
            'request-input': title || 'Input requested',
        };

        if (eventType === 'banner') {
            headerText = fallbackTitles.banner;
            bodyText = subtitle || description || details;
            if (!bodyText && text && text !== headerText) {
                bodyText = text;
            }
        } else {
            headerText = fallbackTitles[eventType] || headerText;
            bodyText = subtitle || description || details || text;
        }

        if (!headerText && !bodyText && text) {
            bodyText = text;
        }

        if (!headerText && !bodyText) {
            return;
        }

        ensureConversationStarted();

        const wrapper = document.createElement('div');
        wrapper.className = 'agent-message agent-message--event';
        if (eventType) {
            wrapper.dataset.eventType = eventType;
        }
        if (payload.level) {
            wrapper.dataset.level = payload.level;
        }

        const bubble = document.createElement('div');
        bubble.className = 'agent-message-bubble agent-message-bubble--event';

        if (headerText && !isApprovalText(headerText)) {
            const header = document.createElement('div');
            header.className = 'agent-event-title';
            header.textContent = headerText;
            bubble.appendChild(header);
        }

        if (bodyText && (!headerText || bodyText !== headerText) && !isApprovalText(bodyText)) {
            const body = document.createElement('div');
            body.className = 'agent-event-body';
            body.textContent = bodyText;
            bubble.appendChild(body);
        }

        const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : null;
        const scopeText = metadata ? normaliseText(metadata.scope).trim() : '';
        if (scopeText) {
            const meta = document.createElement('div');
            meta.className = 'agent-event-meta';
            const scope = document.createElement('span');
            scope.className = 'agent-event-meta-tag';
            scope.textContent = `Scope: ${scopeText}`;
            meta.appendChild(scope);
            bubble.appendChild(meta);
        }

        wrapper.appendChild(bubble);
        messageList.appendChild(wrapper);

        scrollToLatest();
    }

    function normaliseClassList(value) {
        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }
        if (typeof value === 'string') {
            return value
                .split(/\s+/)
                .map((part) => part.trim())
                .filter(Boolean);
        }
        return [];
    }

    function createHighlightedCodeBlock(text, { language = '', classNames = [] } = {}) {
        if (typeof text !== 'string' || text.length === 0) {
            return null;
        }

        const blockClasses = normaliseClassList(classNames);
        const safeLanguage = typeof language === 'string' ? language.trim() : '';

        if (markedLib && typeof markedLib.parse === 'function') {
            try {
                const markdown = `\`\`\`${safeLanguage}\n${text}\n\`\`\``;
                const html = markedLib.parse(markdown, {
                    mangle: false,
                    headerIds: false,
                    gfm: true,
                    highlight(code, infoString) {
                        if (!hljsLib) {
                            return code;
                        }
                        const requestedLanguage = safeLanguage || (infoString || '').trim();
                        try {
                            if (requestedLanguage && hljsLib.getLanguage(requestedLanguage)) {
                                return hljsLib.highlight(code, { language: requestedLanguage }).value;
                            }
                            return hljsLib.highlightAuto(code).value;
                        } catch (error) {
                            console.warn('Failed to highlight command preview snippet', error);
                            return code;
                        }
                    },
                });

                const template = document.createElement('template');
                template.innerHTML = html.trim();
                const pre = template.content.querySelector('pre');
                const codeElement = pre ? pre.querySelector('code') : null;
                if (pre && codeElement) {
                    blockClasses.forEach((className) => pre.classList.add(className));
                    if (safeLanguage) {
                        codeElement.classList.add(`language-${safeLanguage}`);
                    }
                    if (hljsLib && !codeElement.classList.contains('hljs')) {
                        codeElement.classList.add('hljs');
                    }
                    return pre;
                }
            } catch (error) {
                console.warn('Failed to render command preview with marked', error);
            }
        }

        const pre = document.createElement('pre');
        blockClasses.forEach((className) => pre.classList.add(className));

        const codeElement = document.createElement('code');
        const content = text;

        if (hljsLib) {
            try {
                const requestedLanguage = safeLanguage && hljsLib.getLanguage(safeLanguage) ? safeLanguage : '';
                if (requestedLanguage) {
                    codeElement.innerHTML = hljsLib.highlight(content, { language: requestedLanguage }).value;
                } else {
                    codeElement.innerHTML = hljsLib.highlightAuto(content).value;
                }
                codeElement.classList.add('hljs');
                if (requestedLanguage) {
                    codeElement.classList.add(`language-${requestedLanguage}`);
                }
            } catch (error) {
                console.warn('Failed to highlight command preview fallback', error);
                codeElement.textContent = content;
                if (safeLanguage) {
                    codeElement.classList.add(`language-${safeLanguage}`);
                }
            }
        } else {
            codeElement.textContent = content;
            if (safeLanguage) {
                codeElement.classList.add(`language-${safeLanguage}`);
            }
        }

        pre.appendChild(codeElement);
        return pre;
    }

    function appendCommand(payload = {}) {
        if (!messageList) {
            return;
        }

        const command = payload.command && typeof payload.command === 'object' ? payload.command : {};
        const runText = normaliseText(command.run);
        const description = normaliseText(command.description).trim();
        const shellText = typeof command.shell === 'string' ? normaliseText(command.shell).trim() : '';
        const cwdText = typeof command.cwd === 'string' ? normaliseText(command.cwd).trim() : '';
        const timeoutSeconds = Number.isFinite(command.timeoutSeconds) ? command.timeoutSeconds : null;
        const filterRegex = typeof command.filterRegex === 'string' ? normaliseText(command.filterRegex).trim() : '';
        const tailLines = Number.isFinite(command.tailLines) ? command.tailLines : null;
        const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null;
        const runtimeMs = Number.isFinite(payload.runtimeMs) ? payload.runtimeMs : null;
        const killed = payload.killed === true;

        const preview = payload.preview && typeof payload.preview === 'object' ? payload.preview : {};
        const stdoutRaw = normaliseText(preview.stdout);
        const stderrRaw = normaliseText(preview.stderr);

        const hasStdout = stdoutRaw.trim().length > 0;
        const hasStderr = stderrRaw.trim().length > 0;
        const hasRunText = runText.trim().length > 0;

        ensureConversationStarted();

        const wrapper = document.createElement('div');
        wrapper.className = 'agent-message agent-message--command';

        const bubble = document.createElement('div');
        bubble.className = 'agent-message-bubble agent-message-bubble--command';

        const title = document.createElement('div');
        title.className = 'agent-command-title';
        title.textContent = 'Shell command executed';
        bubble.appendChild(title);

        if (description) {
            const descriptionEl = document.createElement('div');
            descriptionEl.className = 'agent-command-description';
            descriptionEl.textContent = description;
            bubble.appendChild(descriptionEl);
        }

        if (hasRunText) {
            const runBlock = createHighlightedCodeBlock(runText, {
                language: 'bash',
                classNames: ['agent-command-block', 'agent-command-run'],
            });
            if (runBlock) {
                bubble.appendChild(runBlock);
            }
        }

        const metaItems = [];
        if (shellText) {
            metaItems.push({ label: 'Shell', value: shellText });
        }
        if (cwdText) {
            metaItems.push({ label: 'CWD', value: cwdText });
        }
        if (Number.isFinite(timeoutSeconds)) {
            metaItems.push({ label: 'Timeout', value: `${timeoutSeconds} s` });
        }
        if (filterRegex) {
            metaItems.push({ label: 'Filter', value: filterRegex });
        }
        if (Number.isFinite(tailLines)) {
            metaItems.push({ label: 'Tail lines', value: String(tailLines) });
        }
        if (exitCode !== null) {
            metaItems.push({ label: 'Exit code', value: String(exitCode) });
        }
        if (Number.isFinite(runtimeMs)) {
            metaItems.push({ label: 'Runtime', value: `${Math.round(runtimeMs)} ms` });
        }
        if (killed) {
            metaItems.push({ label: 'Terminated', value: 'Yes' });
        }

        if (metaItems.length > 0) {
            const metaList = document.createElement('div');
            metaList.className = 'agent-command-meta';
            metaItems.forEach((item) => {
                const metaItem = document.createElement('div');
                metaItem.className = 'agent-command-meta-item';

                const label = document.createElement('span');
                label.className = 'agent-command-meta-label';
                label.textContent = item.label;

                const value = document.createElement('span');
                value.className = 'agent-command-meta-value';
                value.textContent = item.value;

                metaItem.appendChild(label);
                metaItem.appendChild(value);
                metaList.appendChild(metaItem);
            });
            bubble.appendChild(metaList);
        }

        function appendOutput(labelText, content, { language = '' } = {}) {
            const section = document.createElement('div');
            section.className = 'agent-command-output';

            const label = document.createElement('div');
            label.className = 'agent-command-output-label';
            label.textContent = labelText;
            section.appendChild(label);

            const block = createHighlightedCodeBlock(content, {
                language,
                classNames: ['agent-command-block', 'agent-command-output-block'],
            });
            if (block) {
                section.appendChild(block);
            }

            bubble.appendChild(section);
        }

        if (hasStdout) {
            appendOutput('stdout', stdoutRaw);
        }

        if (hasStderr) {
            appendOutput('stderr', stderrRaw);
        }

        wrapper.appendChild(bubble);
        messageList.appendChild(wrapper);
        scrollToLatest();
    }

    function handleIncoming(event) {
        if (socket && event?.currentTarget && socket !== event.currentTarget) {
            return;
        }
        let payload;
        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            console.warn('Failed to parse agent payload', error);
            return;
        }

        if (!payload || typeof payload !== 'object') {
            return;
        }

        switch (payload.type) {
            case 'agent_message': {
                const text = normaliseText(payload.text).trim();
                if (text) {
                    updateThinkingState(false);
                    appendMessage('agent', text);
                }
                break;
            }
            case 'agent_status': {
                const text = normaliseText(payload.text);
                const statusPayload = { ...payload, text };
                if (isApprovalNotification(statusPayload)) {
                    break;
                }
                if (text) {
                    const level = typeof payload.level === 'string' ? payload.level : undefined;
                    setStatus(text, { level });
                }
                break;
            }
            case 'agent_error': {
                updateThinkingState(false);
                const message = normaliseText(payload.message);
                if (message) {
                    setStatus(message, { level: 'error' });
                    appendMessage('agent', message);
                }
                const details = normaliseText(payload.details).trim();
                if (details && details !== message) {
                    appendMessage('agent', details);
                }
                break;
            }
            case 'agent_thinking': {
                if (payload.state === 'start') {
                    updateThinkingState(true);
                } else if (payload.state === 'stop') {
                    updateThinkingState(false);
                }
                break;
            }
            case 'agent_request_input': {
                updateThinkingState(false);
                const promptText = normaliseText(payload.prompt).trim();
                if (!promptText || promptText === '▷' || isApprovalText(promptText)) {
                    setStatus('');
                } else {
                    setStatus(promptText);
                }
                break;
            }
            case 'agent_plan':
                ensureConversationStarted();
                planDisplay?.update(payload.plan);
                break;
            case 'agent_event': {
                const eventType = typeof payload.eventType === 'string' ? payload.eventType : 'event';
                appendEvent(eventType, payload);
                break;
            }
            case 'agent_command':
                updateThinkingState(false);
                appendCommand(payload);
                break;
            default:
                console.warn('Received unsupported agent payload', payload);
                break;
        }
    }

    function handleOpen(event) {
        if (socket && event?.currentTarget && socket !== event.currentTarget) {
            return;
        }
        if (destroyed || !socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }
        isConnected = true;
        updateThinkingState(false);
        setStatus('Connected to the agent runtime.', { level: 'info' });
        flushPending();
    }

    function handleClose(event) {
        if (socket && event?.currentTarget && socket !== event.currentTarget) {
            return;
        }
        if (destroyed) {
            return;
        }
        isConnected = false;
        updateThinkingState(false);
        setStatus('Reconnecting to the agent runtime...', { level: 'warn' });
        scheduleReconnect();
    }

    function handleError(event) {
        if (socket && event?.currentTarget && socket !== event.currentTarget) {
            return;
        }
        if (!socket) {
            return;
        }
        updateThinkingState(false);
        try {
            socket.close();
        } catch (error) {
            console.warn('Failed to close agent socket after error', error);
        }
        setStatus('Agent connection encountered an error.', { level: 'error' });
    }

    function connect() {
        if (destroyed) {
            return;
        }

        clearReconnectTimer();

        if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
            try {
                socket.close();
            } catch (error) {
                console.warn('Failed to close existing agent socket', error);
            }
        }

        let url;
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            url = `${protocol}://${window.location.host}/ws/agent`;
        } catch (error) {
            console.error('Failed to resolve agent websocket URL', error);
            scheduleReconnect();
            return;
        }

        setStatus('Connecting to the agent runtime...');

        const nextSocket = new WebSocket(url);
        socket = nextSocket;

        nextSocket.addEventListener('open', handleOpen);
        nextSocket.addEventListener('message', handleIncoming);
        nextSocket.addEventListener('close', handleClose);
        nextSocket.addEventListener('error', handleError);
    }

    function queueMessage(text) {
        if (!text) {
            return;
        }
        pendingMessages.push(text);
        flushPending();
        if (!isConnected) {
            if (!socket || socket.readyState === WebSocket.CLOSED) {
                connect();
            }
            scheduleReconnect();
            setStatus('Waiting for the agent runtime connection...');
        }
    }

    function sendUserMessage(rawText) {
        if (typeof rawText !== 'string' || isThinking) {
            return false;
        }
        const trimmed = rawText.trim();
        if (!trimmed) {
            return false;
        }

        appendMessage('user', trimmed);
        queueMessage(trimmed);
        return true;
    }

    function handleStartSubmit(event) {
        event.preventDefault();
        const value = startInput?.value || '';
        const sent = sendUserMessage(value);
        if (sent && startInput) {
            startInput.value = '';
        }
    }

    function handleChatSubmit(event) {
        event.preventDefault();
        const value = chatInput?.value || '';
        const sent = sendUserMessage(value);
        if (sent && chatInput) {
            chatInput.value = '';
            autoResize(chatInput);
        }
    }

    function handleChatKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleChatSubmit(event);
        }
    }

    function addListener(target, type, handler) {
        if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') {
            return;
        }
        target.addEventListener(type, handler);
        cleanupFns.push(() => target.removeEventListener(type, handler));
    }

    addListener(startForm, 'submit', handleStartSubmit);
    addListener(chatForm, 'submit', handleChatSubmit);
    addListener(chatInput, 'keydown', handleChatKeydown);
    addListener(chatInput, 'input', () => autoResize(chatInput));

    if (chatInput) {
        autoResize(chatInput);
    }

    updateStatusDisplay();
    updatePanelState();
    return {
        connect,
        dispose() {
            destroyed = true;
            planDisplay?.reset?.();
            clearReconnectTimer();
            updateThinkingState(false);
            if (socket) {
                try {
                    socket.close();
                } catch (error) {
                    console.warn('Failed to close agent socket on dispose', error);
                }
                socket = null;
            }
            cleanupFns.splice(0).forEach((cleanup) => {
                try {
                    cleanup();
                } catch (error) {
                    console.warn('Failed to clean up chat listener', error);
                }
            });
        },
    };
}
