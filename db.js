require('dotenv').config();
const { MongoClient } = require('mongodb');
const { generateRandomColor } = require('./utils/colorUtils');
const uri = process.env.MONGO_URI;

if (!uri) {
    throw new Error('Mongo_URI is not defined in environment variables.');
}

const client = new MongoClient(uri);
let db;

async function connectToDatabase() {
    if (db) return db;

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        db = client.db('Vreunde');
        // await createTTLIndex();
        await createMessageCompoundIndex();
        return db;
    } catch (err) {
        console.error('Error connecting to MongoDB', err);
        throw new Error('Failed to connect to MongoDB');
    }
}

async function closeConnection() {
    if (!client) return;

    try {
        await client.close();
        console.log('MongoDB connection closed');
    } catch (err) {
        console.error('Error closing MongoDB connection', err);
        throw new Error('Failed to close MongoDB connection');
    }
}

async function getCollection(collectionName) {
    const db = await connectToDatabase();
    return db.collection(collectionName);
}

async function getAllFriends() {
    try {
        const friendsCollection = await getCollection('friends');
        return friendsCollection.find({}).toArray();
    } catch (err) {
        console.error('Error retrieving friends:', err);
        throw new Error('Failed to retrieve friends');
    }
}

async function getAllFriendsInGroup(groupId) {
    try {
        const friendsCollection = await getCollection('friends');
        return await friendsCollection.find({ groupId: groupId }).toArray();
    } catch (err) {
        console.error(`Error retrieving friends in group: ${groupId}`, err);
        throw new Error('Failed to retrieve friendgroup');
    }
}

async function updateTimestamp(friendId, timestamp) {
    try {
        const friendsCollection = await getCollection('friends');
        const updateDoc = {
            $set: {
                lastPing: timestamp,
            },
        };
        const modified = await friendsCollection.updateOne(
            { friendId: friendId },
            updateDoc
        );
        if (modified.modifiedCount === 0) {
            throw new Error('Friend not found');
        }
    } catch (err) {
        if (err.message === 'Friend not found') {
            throw err;
        } else {
            console.error(
                `Error updating timestamp of friend with friendID: ${friendId}`,
                err
            );
            throw new Error('Failed to update timestamp of friend');
        }
    }
}

async function setTimeout(friendId, start, end) {
    try {
        const friendsCollection = await getCollection('friends');
        const result = await friendsCollection.updateOne(
            { friendId: friendId }, // Filter
            { $set: { 'timeout.start': start, 'timeout.end': end } }, // Update
            { upsert: true } // Options
        );
        if (result.modifiedCount === 0) {
            throw new Error('Friend not found');
        }
    } catch (err) {
        throw err;
    }
}

async function getTimeout(friendId) {
    try {
        const friendsCollection = await getCollection('friends');
        const friend = await friendsCollection.findOne({ friendId: friendId });
        if (!friend || !friend.timeout) return null;
        return friend.timeout;
    } catch (err) {
        throw err;
    }
}

async function getFriend(friendId) {
    try {
        const friendsCollection = await getCollection('friends');
        const friend = await friendsCollection.findOne({ friendId: friendId });

        if (!friend) throw new Error('Friend not found');

        return friend;
    } catch (err) {
        if (err.message === 'Friend not found') {
            throw err;
        } else {
            console.error(
                `Error retrieving friend with friendId: ${friendId}`,
                err
            );
            throw new Error('Failed to retrieve friend');
        }
    }
}

async function createNewFriend(data) {
    try {
        const friendsCollection = await getCollection('friends');
        const { friendId, groupId } = data;
        const friend = await friendsCollection.findOne({ friendId: friendId });

        if (friend) throw new Error('Friend already exists');

        // Fetch all friends in friend group
        const groupFriends = await friendsCollection
            .find({ groupId: groupId })
            .toArray();
        // Extract existing colors
        const reservedColors = new Set(
            groupFriends.map((friend) => friend.color)
        );
        // Generate new color
        data.color = generateRandomColor(reservedColors);
        data.timeout = {
            start: '00:00',
            end: '23:59',
        };
        data.lastPing = new Date();
        data.queue = [];
        return await friendsCollection.insertOne(data);
    } catch (err) {
        if (err.message === 'Friend already exists') {
            throw err;
        } else {
            console.error('Error creating new friend resource: ', err);
            throw new Error('Failed to create new friend resource');
        }
    }
}

async function pingFriend(data) {
    try {
        const friendsCollection = await getCollection('friends');
        const updateDoc = {
            $set: {
                tileIds: data.tileIds,
                lastPing: new Date(),
            },
        };
        return await friendsCollection.updateOne(
            { friendId: data.friendId },
            updateDoc
        );
    } catch (err) {
        console.error('Error updating friend: ', err);
        throw new Error('Failed to update friend');
    }
}

async function addToQueue(friendId, colors) {
    try {
        const friendsCollection = await getCollection('friends');
        const updateDoc = {
            $push: {
                queue: colors,
            },
        };

        const result = await friendsCollection.updateOne(
            { friendId },
            updateDoc
        );
        if (result.matchedCount === 0) {
            throw new Error('Friend not found');
        }

        console.log(`Colors added to the queue for friendId: ${friendId}`);
        return result;
    } catch (err) {
        console.error('Error adding to queue: ', err);
        throw new Error('Failed to add to queue');
    }
}

async function createTTLIndex() {
    try {
        const friendsCollection = await getCollection('friends');
        await friendsCollection.createIndex(
            { lastPing: 1 },
            { expireAfterSeconds: 150 }
        );
        console.log('TTL index created on lastPing field');
    } catch (err) {
        console.error('Error creating TTL index:', err);
        throw new Error('Failed to create TTL index');
    }
}

async function createMessageCompoundIndex() {
    try {
        const messageCollection = await getCollection('messages');
        await messageCollection.createIndex({
            fromFriendId: 1,
            toFriendId: 1,
            timestamp: -1,
        });
        console.log('Compound index for message collection created');
    } catch (err) {
        console.error(
            'Error creating compound index for message collection: ',
            err
        );
        throw new Error('Failed to create compound index');
    }
}

async function saveMessage(message) {
    try {
        const messageCollection = await getCollection('messages');
        message.timestamp = new Date();
        await messageCollection.insertOne(message);
    } catch (err) {
        console.log(err);
        throw err;
    }
}

async function getAllMessages() {
    try {
        const messageCollection = await getCollection('messages');
        const messages = await messageCollection.find({});
        return messages.toArray();
    } catch (err) {
        console.log(err);
        throw err;
    }
}

async function getMessageWithQuery(query) {
    try {
        const messageCollection = await getCollection('messages');
        return await messageCollection
            .find(query)
            .sort({ timestamp: -1 })
            .toArray();
    } catch (err) {
        console.log(err);
        throw err;
    }
}

async function getGeneratedCodes() {
    try {
        const idCollection = await getCollection('ids');
        return await idCollection.find({}).toArray();
    } catch (err) {
        console.log(err);
        throw err;
    }
}

async function saveGeneratedCode(id, qrcode) {
    try {
        const idCollection = await getCollection('ids');
        const data = {
            friendId: id,
            qrcodestring: qrcode,
        };
        await idCollection.insertOne(data);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function saveMessageData(message) {
    try {
        const studyData = await getCollection('study');
        await studyData.insertOne(message);
    } catch (err) {
        console.error(err);
        throw err;
    }
}

async function retrieveStudyData() {
    try {
        const studyData = await getCollection('study');
        return await studyData.find({}).toArray();
    } catch (err) {
        console.error(err);
        throw err;
    }
}

module.exports = {
    connectToDatabase,
    closeConnection,
    getAllFriends,
    getAllFriendsInGroup,
    getFriend,
    createNewFriend,
    pingFriend,
    addToQueue,
    updateTimestamp,
    saveMessage,
    getAllMessages,
    getMessageWithQuery,
    saveGeneratedCode,
    getGeneratedCodes,
    saveMessageData,
    retrieveStudyData,
    setTimeout,
    getTimeout,
};
