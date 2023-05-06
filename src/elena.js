// Required modules and packages
const Discord = require('discord.js');
const client = new Discord.Client();
const openai = require('openai');
const fs = require('fs');
require('dotenv').config();

// Configuration
const openaiConfig = {
    engine: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 150,
};
const API_KEY = process.env.OPENAI_API_KEY;

// Memory and data
const elenaData = require('./elena-data.json');
elenaData.boss = elenaData.boss || null;
elenaData.role = elenaData.role || null;
elenaData.details = elenaData.details || {};

let elenaMemory = {};
if (fs.existsSync('./elena-memory.json')) {
    const memoryData = fs.readFileSync('./elena-memory.json', 'utf8');
    elenaMemory = JSON.parse(memoryData);
}

// Connect to Discord API
client.login(process.env.DISCORD_API_KEY);

// Event: Bot ready
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await initializeElena(client);
});

// Function to initialize Elena
const initializeElena = async (client) => {
    if (!elenaMemory.initialized) {
        const channelId = process.env.INITIALIZATION_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId);

        // Helper function to send a prompt and collect a response
        const collectResponse = async (prompt) => {
            await channel.send(prompt);
            return new Promise((resolve) => {
                const filter = (response) => response.author.id !== client.user.id;
                const collector = channel.createMessageCollector(filter, { max: 1 });
                collector.on('collect', (message) => {
                    resolve(message.content);
                });
            });
        };

        // Collect boss, role, and details data
        elenaData.boss = await collectResponse("Who is your boss?");
        elenaData.role = await collectResponse("What is my role?");
        const detailsPrompt = "Please provide the core details for my behavior, personality, and other attributes.";
        elenaData.details.description = await collectResponse(detailsPrompt);

        // Save data to file
        fs.writeFileSync('./elena-data.json', JSON.stringify(elenaData));

        // Set initialized to true and save memory to file
        elenaMemory.initialized = true;
        fs.writeFileSync('./elena-memory.json', JSON.stringify(elenaMemory));

        channel.send("Thank you! Initialization is complete.");
    }
};

// Event: Message received
client.on('message', async message => {
    if (message.author.bot) return; // Ignore messages from bots

    // Check if the message mentions Elena or is a command
    const elenaMentioned = message.mentions.users.some(user => user.id === client.user.id);
    const isCommand = message.content.startsWith(process.env.PREFIX);

    // Process message only if it mentions Elena or is a command
    if (elenaMentioned || isCommand) {
        let prompt = "";
        let options = {};

        // Handle commands
        if (isCommand) {
            // Extract command and arguments
            const args = message.content.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // Define prompts for known commands
            switch (command) {
                case 'ping':
                    prompt = "How can I assist you today?";
                    break;
                case 'help':
                    prompt = "I'd be happy to help. What do you need assistance with?";
                    break;
                default:
                    prompt = "I'm sorry, but I didn't quite understand. Could you please rephrase your request or provide more details?";
            }
        } else if (elenaMentioned) {
            // Handle messages mentioning Elena
            prompt = `Hello, ${message.author.username}. How can I assist you today?`;
        }

        // Prepare options for OpenAI API
        options = {
            context: message.content,
            elenaData: elenaData,
            elenaMemory: elenaMemory,
        };

        // Call OpenAI API and handle response
        const result = await analyzeResult(prompt, options);
        message.channel.send(result.choices[0].text);

        // Update memory
        updateMemory(elenaMemory, message, result);
    }
});

// Function to analyze the result using OpenAI API
const analyzeResult = async (prompt, options, callback) => {
    try {
        const result = await openai.complete({
            engine: openaiConfig.engine,
            prompt: prompt,
            maxTokens: 60,
            ...options,
            apiKey: API_KEY,
        });
        callback(result);
    } catch (error) {
        console.error(error);
        callback(null);
    }
};

// Function to update memory
const updateMemory = (elenaMemory, message, result) => {
    const userId = message.author.id;

    // Initialize user memory if it doesn't exist
    if (!elenaMemory.users[userId]) {
        elenaMemory.users[userId] = {
            "userID": userId,
            "messageHistory": [],
            "searchHistory": [],
            "schedule": {},
            "reminders": [],
            "preferences": {},
            "priorities": {},
            "confidentiality": {},
            "commitments": {},
            "communicationStyle": {},
            "positives": {},
            "negatives": {},
            "expectations": {}
        };
    }

    // Update user-specific memory with the new message
    elenaMemory.users[userId].messageHistory.push({
        timestamp: Date.now(),
        text: message.content,
        result: result
    });

    // Sort messages by timestamp
    elenaMemory.users[userId].messageHistory.sort((a, b) => a.timestamp - b.timestamp);

    // Save memory to file
    fs.writeFileSync('./elena-memory.json', JSON.stringify(elenaMemory));
};

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);