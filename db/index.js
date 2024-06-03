import mongoose from "mongoose";

const connectDb = async () => {
    try {
        const connectionInst = await mongoose.connect(`${process.env.MONGODB_URI}/Room`);
        console.log(`mongodb connected!! at Host: ${connectionInst.connection.host}`)
    } catch (error) {
        console.log("mongodb connect error: " + error);
        process.exit(1);        
    }
}

export default connectDb;