import mongoose from "mongoose";

const connectDatabase = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required.");
    }
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB connection failed:", err.message);
        throw err;
    }
};

export default connectDatabase;