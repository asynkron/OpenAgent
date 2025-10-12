import { createBootProbeResult } from './context.js';

const BUILD_FILES = [
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle.properties',
];

const WRAPPER_SCRIPTS = ['mvnw', 'mvnw.cmd', 'gradlew', 'gradlew.bat'];

const SOURCE_DIRECTORIES = [
  'src/main/java',
  'src/test/java',
  'src/main/kotlin',
  'src/test/kotlin',
  'src/main/scala',
  'src/test/scala',
];

const TOOL_CHECKS = [
  { name: 'java' },
  { name: 'javac' },
  { name: 'mvn', label: 'maven (mvn)' },
  { name: 'gradle' },
];

function formatExampleEntries(entries) {
  const sample = entries
    .slice(0, 3)
    .map((entry) => entry.name)
    .join(', ');
  return entries.length > 3 ? `${sample}, …` : sample;
}

export const JvmBootProbe = {
  name: 'Java / JVM',
  async run(context) {
    const details = [];
    let detected = false;

    for (const file of BUILD_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    for (const script of WRAPPER_SCRIPTS) {
      if (await context.fileExists(script)) {
        detected = true;
        details.push(`${script} wrapper`);
      }
    }

    for (const sourceDir of SOURCE_DIRECTORIES) {
      if (await context.fileExists(sourceDir)) {
        detected = true;
        const label = sourceDir.replace(/\\+/g, '/');
        const entries = await context.readDirEntries(sourceDir);
        const files = entries.filter((entry) => entry.isFile?.());
        if (files.length > 0) {
          details.push(`${label} (${formatExampleEntries(files)})`);
        } else {
          details.push(label);
        }
      }
    }

    const rootEntries = await context.getRootEntries();
    const javaFiles = rootEntries.filter(
      (entry) => entry.isFile?.() && /\.(java|kt|kts|scala)$/i.test(entry.name),
    );
    if (javaFiles.length > 0) {
      detected = true;
      details.push(`JVM sources (${formatExampleEntries(javaFiles)})`);
    }

    const toolAvailability = await Promise.all(
      TOOL_CHECKS.map(async ({ name, command = name, label = name }) => {
        const available = await context.commandExists(command);
        const summary = available
          ? `${label} is installed and ready to use`
          : `${label} is not installed`;
        return { name: label, available, summary };
      }),
    );

    const installedTools = toolAvailability.filter((tool) => tool.available);

    for (const tool of installedTools) {
      details.push(tool.summary);
    }

    const hasHelpfulTooling = detected || installedTools.length > 0;

    const tooling = hasHelpfulTooling
      ? (() => {
          const sections = [
            'Use Maven or Gradle wrappers for builds/tests; ensure Java and javac match the targeted bytecode level.',
          ];

          if (installedTools.length > 0) {
            sections.push('');
            sections.push('### Tool availability');
            sections.push(...installedTools.map((tool) => `- ${tool.summary}`));
            sections.push('');
          }

          return sections.join('\n');
        })()
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default JvmBootProbe;
