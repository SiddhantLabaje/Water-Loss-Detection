import axios from "axios";
import thingSpeakConfig from "../config/thingsSpeakConfig.js";
import Sensor from "../models/sensor.model.js";

const thingsSpeakDataFetch = async () => {
    try {
        const url = `https://api.thingspeak.com/channels/${thingSpeakConfig.channel_id}/feeds.json?api_key=${thingSpeakConfig.read_api_key}&results=8000`;

        const response = await axios.get(url);

        const feeds = response.data.feeds;

        for (const feed of feeds) {
            const entryId = feed.entry_id;

            // Skip if this entry already exists in DB
            const existing = await Sensor.findOne({ entryId });
            if (existing) continue;

            await Sensor.create({
                entryId,
                flowSensorData: Number(feed.field1),
                pressureSensorData: Number(feed.field2),
                tankLevelSensorData: Number(feed.field3),
                predictionData: Number(feed.field4),
            });
        }

        console.log(`Fetched ${feeds.length} entries, saved new ones.`);
    } catch (error) {
        console.log("Error in fetching the data from ThingSpeak:", error);
        throw error;
    }
};

export default thingsSpeakDataFetch;