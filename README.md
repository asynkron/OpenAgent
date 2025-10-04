# OpenAgent
Simple Node.JS based AI agent

## Description
A simple Node.js console application that allows you to chat with OpenAI's GPT models. The app reads input from the console, sends it to the OpenAI API, and prints the response back.

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your OpenAI API key:
```bash
cp .env.example .env
```

4. Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your_actual_api_key_here
```

## Usage

Start the application:
```bash
npm start
```

Type your messages and press Enter to send them to the AI. The AI's responses will be displayed in the console.

To exit the application, type `exit` or `quit`.

## Example

```
OpenAgent - AI Chat Console
Type "exit" or "quit" to end the conversation.

You: What is the capital of France?
AI: The capital of France is Paris.

You: exit
Goodbye!
```

## License
MIT
