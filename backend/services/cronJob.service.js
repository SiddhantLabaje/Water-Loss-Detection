import cron from "node-cron";
import fetchThingSpeakData from "./thingSpeak.service.js";

// Fetch new ThingSpeak readings every 15 seconds.
// ThingSpeak free tier updates every ~15 s, so polling faster than that
// wastes API calls and risks hitting rate limits.
cron.schedule("*/15 * * * * *", async () => {
  try {
    await fetchThingSpeakData();
  } catch (err) {
    console.error("ThingSpeak fetch error:", err.message);
  }
});

console.log("ThingSpeak cron job started — polling every 15 seconds.");
