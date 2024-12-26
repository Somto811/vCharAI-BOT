import axios from "axios";
import fs from "fs/promises";
import Groq from "groq-sdk";
import inquirer from "inquirer";
import { colors } from "./config/colors.js";
import { displayBanner } from "./config/banner.js";
import { CountdownTimer } from "./config/countdown.js";
import { logger } from "./config/logger.js";
import { LOG_MESSAGES } from "./config/constants/loggerMessages.js";

// Constants and Configuration
const GROQ_API_KEY = "groq_api_key";
const CONFIG = {
  // VChars API Configuration
  VCHARS: {
    BASE_URL: "https://app.vchars.ai",
    API_URL: "https://vchars.onlyailabs.dev/api/v1",
    ENDPOINTS: {
      AUTH: "/auth/user",
      WAIFU: "/waifu",
      WAIFU_DETAIL: "/waifu/slug",
      CHAT: "/chat",
      MESSAGE: "/messages/text",
    },
    HEADERS: {
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      Origin: "https://app.vchars.ai",
      Pragma: "no-cache",
      Referer: "https://app.vchars.ai/chats",
      "Sec-Ch-Ua":
        '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "70",
      "Sec-Ch-Ua-Platform": "Windows",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Sentry-Trace": "",
      auth_date: "",
      chat_instance: "",
      chat_type: "channel",
      signature: "",
      hash: "",
    },
  },
  // Groq API Configuration
  GROQ: {
    MODEL: "llama3-8b-8192",
    DEFAULT_PARAMS: {
      temperature: 0.7,
      max_tokens: 150,
    },
  },
  // Chat Configuration
  CHAT: {
    DELAY_BETWEEN_MESSAGES: 2000,
    DEFAULT_CHARACTER: "behind-the-glas",
    HISTORY_FILE: "chat_history.json",
    USER_DATA_FILE: "data.txt",
  },
  // Default user settings
  USER: {
    DEFAULT_LANGUAGE: "en",
    DEFAULT_GENDER: "non_binary",
    DEFAULT_PREFERENCES: "all",
    DEFAULT_START_CODE: "marine_6944804952",
  },
};

// Global variables for AI selection
let selectedAISlug = null;
let selectedAIInfo = null;

class AIChat {
  constructor(groqApiKey) {
    // Initialize base properties
    this.userData = null;
    this.selectedAI = null;
    this.chatId = null;
    this.chatHistory = [];
    this.userDataString = null;

    // Initialize API clients
    this.groq = new Groq({ apiKey: groqApiKey });
    this.axiosConfig = { headers: CONFIG.VCHARS.HEADERS };
  }

  async getGroqResponse(aiMessage, characterContext) {
    try {
      const prompt = `You are having a conversation with an AI character. 
      The character's context is: ${characterContext}
      The AI just said: "${aiMessage}"
      Generate a natural and engaging response that continues the conversation.
      Keep the response concise but contextual.`;

      const chatCompletion = await this.groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: CONFIG.GROQ.MODEL,
        ...CONFIG.GROQ.DEFAULT_PARAMS,
      });

      return chatCompletion.choices[0]?.message?.content || null;
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.MAIN_LOOP("Groq API error: " + error.message)
      );
      return null;
    }
  }

  async autoChatWithGroq(initialMessage) {
    if (!this.selectedAI && !this.chatId) {
      throw new Error(LOG_MESSAGES.ACCOUNT.AI_SELECT_FAILED);
    }

    const characterContext = this.selectedAI
      ? `${this.selectedAI.title}: ${this.selectedAI.description}`
      : "Continuing existing conversation";
    let currentMessage = initialMessage;
    let messageCount = 1;
    let continueChat = true;

    while (continueChat) {
      try {
        logger.info(`[${this.userData.first_name}]: ${currentMessage}`);

        const aiResponse = await this.sendMessage(currentMessage);

        if (!aiResponse) {
          logger.warn("=== Chat ended: Out of gems ===");
          break;
        }

        logger.info(`[${this.selectedAI.title}]: ${aiResponse}`);

        const groqResponse = await this.getGroqResponse(
          aiResponse,
          characterContext
        );
        if (!groqResponse) break;

        currentMessage = groqResponse;
        messageCount++;
      } catch (error) {
        if (error.response?.data?.detail?.includes("don't have enough gems")) {
          logger.warn("=== Chat ended: Out of gems ===");
          break;
        }
        break;
      }
    }

    return this.chatHistory;
  }

  async selectAI(slug = CONFIG.CHAT.DEFAULT_CHARACTER) {
    try {
      const url = `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.WAIFU_DETAIL}/${slug}`;
      const response = await axios.get(url, this.axiosConfig);

      if (response.data.message === "Data got correctly") {
        this.selectedAI = response.data.data;
        return true;
      }
      return false;
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.ACCOUNT_PROCESSING(
          "Select AI error: " + error.message
        )
      );
      return false;
    }
  }

  async getAIList(page = 1, size = 100) {
    try {
      const url = `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.WAIFU}?page=${page}&size=${size}`;
      console.log("Fetching AI characters...");

      const response = await axios.get(url, this.axiosConfig);
      return response.data.data.items || [];
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.MAIN_LOOP("Get AI list error: " + error.message)
      );
      return [];
    }
  }

  async login() {
    if (!this.userData) {
      throw new Error("User data not loaded");
    }

    try {
      const payload = {
        tg_id: this.userData.tg_id,
        tg_username: this.userData.first_name,
        name: this.userData.first_name,
        language: this.userData.language_code,
        gender: CONFIG.USER.DEFAULT_GENDER,
        gender_preferences: CONFIG.USER.DEFAULT_PREFERENCES,
        start_code: this.userData.start_param || CONFIG.USER.DEFAULT_START_CODE,
      };

      const response = await axios.post(
        `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.AUTH}`,
        payload,
        this.axiosConfig
      );

      return response.data.message === "Data created correctly";
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.ACCOUNT_PROCESSING("Login error: " + error.message)
      );
      return false;
    }
  }

  async createNewChat() {
    try {
      const url = `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.CHAT}`;
      const payload = {
        waifu_id: this.selectedAI.id,
      };

      const response = await axios.post(url, payload, this.axiosConfig);

      if (response.data.message === "Data created correctly") {
        this.chatId = response.data.data.id;
        return true;
      }
      return false;
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.ACCOUNT_PROCESSING(
          "Create chat error: " + error.message
        )
      );
      return false;
    }
  }

  async getActiveChats() {
    try {
      const response = await axios.get(
        `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.CHAT}`,
        this.axiosConfig
      );
      return response.data.data || [];
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.ACCOUNT_PROCESSING(
          "Get active chats error: " + error.message
        )
      );
      return [];
    }
  }

  async sendMessage(message) {
    if (!this.chatId) {
      throw new Error("Please start a chat first");
    }

    try {
      const url = `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.MESSAGE}`;
      const payload = {
        chat_id: this.chatId,
        message: message,
      };

      const response = await axios.post(url, payload, this.axiosConfig);

      if (response.data.message === "Data created correctly") {
        return await this.waitForResponse(response.data.data.id);
      }
      return null;
    } catch (error) {
      if (error.response?.data?.detail) {
        logger.error(error.response.data.detail);
      }
      return null;
    }
  }

  async waitForResponse(messageId, maxAttempts = 100) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(
          `${CONFIG.VCHARS.API_URL}${CONFIG.VCHARS.ENDPOINTS.MESSAGE}/${messageId}`,
          this.axiosConfig
        );

        if (response.data.data.status === "completed") {
          return response.data.data.message;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  parseUserData(userDataStr) {
    try {
      const params = new URLSearchParams(userDataStr);
      const userJson = params.get("user");

      if (!userJson) {
        throw new Error("No user data found in string");
      }

      const userData = JSON.parse(decodeURIComponent(userJson));

      const parsedData = {
        tg_id: userData.id?.toString(),
        first_name: userData.first_name,
        language_code: userData.language_code || CONFIG.USER.DEFAULT_LANGUAGE,
        chat_instance: params.get("chat_instance"),
        start_param: params.get("start_param"),
      };

      return parsedData;
    } catch (error) {
      logger.error(
        LOG_MESSAGES.ERROR.ACCOUNT_PROCESSING(
          "Error parsing user data: " + error.message
        )
      );
      return null;
    }
  }
}

// Read accounts from file
async function readAccounts(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.split("\n").filter((line) => line.trim());
  } catch (error) {
    logger.error(
      LOG_MESSAGES.ERROR.MAIN_LOOP("Error reading accounts: " + error.message)
    );
    return [];
  }
}

// Delay function
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Select AI at program start with proper authentication
async function selectInitialAI() {
  try {
    const bot = new AIChat(GROQ_API_KEY);

    // First load and authenticate using the first account
    const accounts = await readAccounts(CONFIG.CHAT.USER_DATA_FILE);
    if (accounts.length === 0) {
      throw new Error(LOG_MESSAGES.SYSTEM.NO_ACCOUNTS);
    }

    // Setup authentication using first account
    const firstAccount = accounts[0];
    bot.userDataString = firstAccount;
    bot.userData = bot.parseUserData(firstAccount);
    bot.axiosConfig.headers["User-Data"] = firstAccount;

    const params = new URLSearchParams(firstAccount);
    bot.axiosConfig.headers.auth_date = params.get("auth_date") || "";
    bot.axiosConfig.headers.chat_instance = params.get("chat_instance") || "";
    bot.axiosConfig.headers.signature = params.get("signature") || "";
    bot.axiosConfig.headers.hash = params.get("hash") || "";

    // Login first
    const loginSuccess = await bot.login();
    if (!loginSuccess) {
      throw new Error(LOG_MESSAGES.ACCOUNT.LOGIN_FAILED);
    }

    // Now fetch AI list
    const aiList = await bot.getAIList();

    if (!aiList || aiList.length === 0) {
      throw new Error(LOG_MESSAGES.SYSTEM.NO_AI);
    }

    const choices = [
      ...aiList.map((ai) => ({
        name: `  ${ai.title}`,
        value: ai.slug,
      })),
      new inquirer.Separator("\n"),
    ];

    const { selected } = await inquirer.prompt([
      {
        type: "list",
        name: "selected",
        message: "Select an AI character that will be used for all accounts:",
        choices: choices,
        pageSize: 5,
      },
    ]);

    selectedAISlug = selected;

    const success = await bot.selectAI(selected);
    if (success) {
      selectedAIInfo = bot.selectedAI;
      logger.info(`Selected AI: ${selectedAIInfo.title}`);
      logger.info("This AI will be used for all accounts.");
      return true;
    }
    return false;
  } catch (error) {
    logger.error(
      LOG_MESSAGES.ERROR.MAIN_LOOP(
        "Error selecting initial AI: " + error.message
      )
    );
    return false;
  }
}

// Handle individual account
async function handleAccount(accountData) {
  try {
    const bot = new AIChat(GROQ_API_KEY);

    bot.userDataString = accountData;
    bot.userData = bot.parseUserData(accountData);
    bot.axiosConfig.headers["User-Data"] = accountData;

    const params = new URLSearchParams(accountData);
    bot.axiosConfig.headers.auth_date = params.get("auth_date") || "";
    bot.axiosConfig.headers.chat_instance = params.get("chat_instance") || "";
    bot.axiosConfig.headers.signature = params.get("signature") || "";
    bot.axiosConfig.headers.hash = params.get("hash") || "";

    logger.info(LOG_MESSAGES.ACCOUNT.PROCESSING(bot.userData.first_name));

    const loginSuccess = await bot.login();
    if (!loginSuccess) throw new Error(LOG_MESSAGES.ACCOUNT.LOGIN_FAILED);

    logger.info(LOG_MESSAGES.CHAT.SELECTING_AI);
    const selectSuccess = await bot.selectAI(selectedAISlug);
    if (!selectSuccess) throw new Error(LOG_MESSAGES.ACCOUNT.AI_SELECT_FAILED);

    const activeChats = await bot.getActiveChats();
    let activeChat = activeChats.find(
      (chat) => chat.waifu.id === bot.selectedAI.id
    );

    if (!activeChat) {
      logger.info(LOG_MESSAGES.CHAT.CREATING_SESSION);
      const chatCreated = await bot.createNewChat();
      if (!chatCreated) {
        throw new Error("Failed to create new chat");
      }
      logger.success(LOG_MESSAGES.CHAT.SESSION_CREATED);
    } else {
      bot.chatId = activeChat.id;
      logger.info(LOG_MESSAGES.CHAT.USING_EXISTING);
    }

    await bot.autoChatWithGroq("Hi!");
    logger.success(LOG_MESSAGES.ACCOUNT.FINISHED(bot.userData.first_name));
  } catch (error) {
    logger.error(LOG_MESSAGES.ERROR.ACCOUNT_PROCESSING(error.message));
  }
}

// Main function
async function main() {
  displayBanner();

  while (true) {
    try {
      if (!selectedAISlug) {
        const success = await selectInitialAI();
        if (!success) throw new Error(LOG_MESSAGES.SYSTEM.NO_AI);
      }

      const accounts = await readAccounts(CONFIG.CHAT.USER_DATA_FILE);
      if (accounts.length === 0) {
        throw new Error(LOG_MESSAGES.SYSTEM.NO_ACCOUNTS);
      }

      // Process each account
      for (const account of accounts) {
        await handleAccount(account);
        await delay(5000); // 5-second delay between accounts
      }

      logger.success(LOG_MESSAGES.SYSTEM.CYCLE_COMPLETE);
      logger.info(LOG_MESSAGES.SYSTEM.WAITING_NEXT_CYCLE);

      // Use CountdownTimer for waiting period
      const timer = new CountdownTimer({
        message: "Next cycle in: ",
        format: "HH:mm:ss",
      });
      await timer.start(24 * 60 * 60); // 24 hours in seconds
    } catch (error) {
      logger.error(LOG_MESSAGES.ERROR.MAIN_LOOP(error.message));
      logger.warn(LOG_MESSAGES.SYSTEM.RETRY_WAIT);

      // Use CountdownTimer for retry wait
      const timer = new CountdownTimer({
        message: "Retrying in: ",
        format: "mm:ss",
      });
      await timer.start(60 * 60); // 1 hour in seconds
    }
  }
}

main().catch((error) =>
  logger.error(LOG_MESSAGES.ERROR.MAIN_LOOP(error.message))
);
