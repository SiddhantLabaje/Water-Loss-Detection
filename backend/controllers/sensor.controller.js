import Sensor from "../models/sensor.model.js"
import thingsSpeakDataFetch from "../services/thingSpeak.service.js"

const getSensorData=async(req,res)=>{
    try {
        const data=Sensor.find().sort({createdAt:-1});
        res.json(data);
    } catch (error) {
        res.status(500).json({
      message: error.message,
    
})
    }}

export default getSensorData;