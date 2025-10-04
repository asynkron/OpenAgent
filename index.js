require('dotenv').config();
const OpenAI = require('openai');
const readline = require('readline');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('Error: OPENAI_API_KEY not found in environment variables.');
  console.error('Please create a .env file with your OpenAI API key.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: apiKey,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function chat() {
  rl.question('You: ', async (input) => {
    const userInput = input.trim();

    if (!userInput) {
      chat();
      return;
    }

    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      console.log('Goodbye!');
      rl.close();
      return;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: userInput,
          },
        ],
      });

      const response = completion.choices[0].message.content;
      console.log(`AI: ${response}\n`);
    } catch (error) {
      console.error('Error calling OpenAI API:', error.message);
    }

    chat();
  });
}

console.log('OpenAgent - AI Chat Console');
console.log('Type "exit" or "quit" to end the conversation.\n');
chat();
