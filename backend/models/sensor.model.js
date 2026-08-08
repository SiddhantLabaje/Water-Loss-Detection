import mongoose from "mongoose";

const sensorSchema=new mongoose.Schema({
    entryId:{
        required:true,
        type:Number,
        unique:true
    },
    flowSensorData:{
        required:true,
        type:Number
    },
    pressureSensorData:{
        required:true,
        type:Number
    },
    tankLevelSensorData:{
        required:true,
        type:Number
    },
    predictionData:{
        required:true,
        type:Number
    }
},{timestamps:true});

const Sensor = mongoose.model("Sensor", sensorSchema);

export default Sensor;