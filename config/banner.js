import figlet from "figlet";
import { colors } from "./colors.js";

export function displayBanner() {
  const banner = figlet.textSync("vCharsAI BOT", {
    font: "ANSI Shadow",
    horizontalLayout: "default",
    verticalLayout: "default",
    width: 150,
  });

  console.log(`${colors.bannerText}${banner}${colors.reset}`);
  console.log(
    `${colors.bannerBorder}===============================================${colors.reset}`
  );
  console.log(
    `${colors.bannerLinks}GitHub  : https://github.com/Galkurta${colors.reset}`
  );
  console.log(
    `${colors.bannerLinks}Telegram: https://t.me/galkurtarchive${colors.reset}`
  );
  console.log(
    `${colors.bannerBorder}===============================================\n${colors.reset}`
  );
}
