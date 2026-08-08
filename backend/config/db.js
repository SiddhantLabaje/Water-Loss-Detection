import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
console.log("MONGO_URI:", process.env.MONGO_URI);
const connectDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected");
    } catch (err) {
        console.log("Error occurred during database connection", err);
        process.exit(1);
    }
};

export default connectDatabase;