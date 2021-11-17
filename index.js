const { application, json } = require('express');
const express = require('express');
const app = express();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId
const admin = require("firebase-admin");
require('dotenv').config();
const cors = require('cors');
const fileUpload = require('express-fileupload');
const port = process.env.PORT || 8000


app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.57jms.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


// payment stripe

const stripe = require("stripe")(process.env.STRIPE_SECRET);


// firebase auth service
const serviceAccount = JSON.parse(process.env.FIREBASE_AUTH_ACCOUNT);


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// for verify JWT
async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];
        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }

    }
    next();
}


async function run() {
    try {
        await client.connect();
        const database = client.db("doctor_portal");
        const appoinmentsCollection = database.collection("appointments");
        const usersCollection = database.collection("users");
        const doctorsCollection = database.collection("doctors");

        // post appointment
        app.post('/appointments', async (req, res) => {
            const body = req.body;
            const result = await appoinmentsCollection.insertOne(body);
            res.json(result)
        })
        // get appointment by id
        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const find = { _id: ObjectId(id) }
            const result = await appoinmentsCollection.findOne(find);
            res.json(result)
        })
        // add payment by id
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                  payment:payment
                },
              };
              const result = await appoinmentsCollection.updateOne(filter, updateDoc, options);
            res.json(result)
        })

        // get appointment
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            const find = { email: email, date: date }
            const result = await appoinmentsCollection.find(find).toArray();
            res.send(result)
        })


            // add doctors
            app.post('/doctors', async (req, res) => {
                const name = req.body.name;
                const email = req.body.email;
                const pic = req.files.image;
                const picData = pic.data;
                const encodedPic = picData.toString('base64');
                const imageBuffer = Buffer.from(encodedPic,'base64')
                const doctor={
                    name,
                    email,
                    image : imageBuffer,
                }
                const result = await doctorsCollection.insertOne(doctor);
                console.log(doctor);
                res.json(result)
            })


              // get appointment
        app.get('/doctors',  async (req, res) => {
            const result = await doctorsCollection.find({}).toArray();
            res.send(result)
        })

        // post user
        app.post('/users', async (req, res) => {
            const body = req.body;
            const result = await usersCollection.insertOne(body);
            res.json(result)
        })

        // put for google user
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result)
        })
        // put for admin roll
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester })
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result)
                }
            }
            else {
                res.status(403).json({ message: "You don't have access to make admin !" })
            }

        })


        // set admin
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const find = { email: email };
            const user = await usersCollection.findOne(find);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin })
        })



        // payment
        app.post("/create-payment-intent", async (req, res) => {
            const paymentInfo = req.body;
          
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
              amount: paymentInfo.price * 100,
              currency: "usd",
              payment_method_types: ["card"],
            });
          
            res.send({
              clientSecret: paymentIntent.client_secret,
            });
          });


    } finally {
        //   await client.close();  
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('server working!')
})

app.listen(port, () => {
    console.log(`Running doctor server`, port)
})