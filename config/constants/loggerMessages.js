export const LOG_MESSAGES = {
  SYSTEM: {
    CYCLE_COMPLETE: "Daily Cycle Completed",
    WAITING_NEXT_CYCLE: "Waiting 24 hours before next cycle...",
    RETRY_WAIT: "Retrying in 1 hour...",
    NO_ACCOUNTS: "No accounts found in data file",
    NO_AI: "Failed to select initial AI",
  },
  ACCOUNT: {
    PROCESSING: (name) => `Processing Account: ${name}`,
    FINISHED: (name) => `Finished Processing Account: ${name}`,
    LOGIN_FAILED: "Login failed",
    AI_SELECT_FAILED: "Failed to select AI",
  },
  CHAT: {
    SELECTING_AI: "Selecting pre-chosen AI...",
    CREATING_SESSION: "Creating new chat session...",
    SESSION_CREATED: "Chat session created successfully!",
    USING_EXISTING: "Using existing chat session.",
  },
  ERROR: {
    MAIN_LOOP: (message) => `Error in main loop: ${message}`,
    ACCOUNT_PROCESSING: (message) => `Account processing error: ${message}`,
  },
};
