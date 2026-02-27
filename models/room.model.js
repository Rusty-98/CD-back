import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    users: [
        {
            id: { type: String, required: true },
            name: { type: String, required: true }
        }
    ],
    currentCode: {
        type: String,
        default: ''
    },
    currentLang: {
        type: String,
        default: 'java'
    }
});

const Room = mongoose.model('Room', userSchema);

export default Room;