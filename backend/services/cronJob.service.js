import cron from "node-cron";
import fetchThingSpeakData from "./thingSpeak.service.js";

cron.schedule("* * * * * *", async () => {
  console.log("Fetching ThingSpeak Data...");
  await fetchThingSpeakData();
});