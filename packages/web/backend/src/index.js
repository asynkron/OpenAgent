import { ChatAgentServer } from './server.js';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const autoApproveEnv = process.env.AGENT_AUTO_APPROVE;
const autoApprove = autoApproveEnv == null ? true : autoApproveEnv !== 'false';

const server = new ChatAgentServer({
  port,
  agent: {
    autoApprove,
  },
});

server.start().catch((error) => {
  console.error('Failed to start chat agent backend:', error);
  process.exitCode = 1;
});
