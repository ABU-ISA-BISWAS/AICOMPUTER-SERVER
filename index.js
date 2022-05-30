const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const res = require('express/lib/response');
const query = require('express/lib/middleware/query');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000 ;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pvgep.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
function verifyJWT(req,res,next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
      return res.status(401).send({message:'Unauthorized access'})
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,function(err,decoded){
      if(err){
        return res.status(403).send({message:'Forbidden access'})
      }
      req.decoded = decoded;
      next();
    })
    
    }

async function run(){
    try{
        await client.connect();
        const toolsCollection = client.db('computer-point').collection('tools');
        const orderCollection = client.db('computer-point').collection('orders');
        const  usersCollection = client.db('computer-point').collection('users');
        const  reviewCollection = client.db('computer-point').collection('reviews');
        const  paymentCollection = client.db('computer-point').collection('payments');


        const verifyAdmin = async(req,res,next)=>{
            const requester =req.decoded.email; 
            const requesterAccount =await usersCollection.findOne({email:requester}) ; 
            if(requesterAccount.role === 'admin'){
              next();
            }
            else{
              res.status(403).send({message:'Forbidden'});
            }  
          }

        app.get('/tools',async(req,res)=>{
            const query ={};
            const cursor = toolsCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);
        });

        app.post('/tools', async (req, res) => {
          const product = req.body;
          const result = await toolsCollection.insertOne(product);
          res.send(result);
        });
        
        app.get('/tools/:id', async(req,res)=>{
            const id= req.params.id;
            const query = {_id:ObjectId(id)};
            const tool =await toolsCollection.findOne(query);
            res.send(tool);
          });

          app.get('/reviews',async(req,res)=>{
            const query ={};
            const cursor = reviewCollection.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews);
        });
        
        app.post('/reviews', async (req, res) => {
            const myReviews = req.body;
            const result = await reviewCollection.insertOne(myReviews);
            res.send(result);
          });

          app.post('/order',async (req,res)=>{
            const order=req.body;
            const result = await orderCollection.insertOne(order);
             res.send(result);
          });

          app.get('/order',async(req,res)=>{
            const query ={};
            const cursor = orderCollection.find(query);
            const orders = await cursor.toArray();
            res.send(orders);
        });

          app.get('/order', verifyJWT, async(req,res)=>{
            const user= req.query.user;
            
           const decodedEmail = req.decoded.email;
           if(user === decodedEmail){
            const query ={user:user};
            const orders =await orderCollection.find(query).toArray();
            res.send(orders);
           }
           else{
             return res.status(403).send({message:'Forbidden access'});
           }
           
          });

          app.get('/order/:id', verifyJWT, async(req,res)=>{
            const id= req.params.id;
            const query = {_id:ObjectId(id)};
            const order =await orderCollection.findOne(query);
            res.send(order);
          });

          app.post('/create-payment-intent',verifyJWT, async(req,res)=>{
            const order =req.body;
            const price=order.price;
            const amount=price*100;
            const paymentIntent =await stripe.paymentIntents.create({
              amount:amount,
              currency:'usd',
              payment_method_types:['card']
            });
            res.send({clientSecret:paymentIntent.client_secret});
          });

          app.patch('/order/:id', async(req,res)=>{
            const id =req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updatedDoc ={
              $set:{
                paid:true,
                transactionId:payment.transactionId
              }
            }
            const updatedOrder =await orderCollection.updateOne(filter,updatedDoc);
            const result = await paymentCollection.insertOne(payment);
            res.send(updatedDoc);
  
          })

          app.delete('/order/:id', verifyJWT, async(req,res)=>{
            const id= req.params.id;
            const query = {_id:ObjectId(id)};
            const result =await orderCollection.deleteOne(query);
            res.send(result);
          })

          app.delete('/tools/:id', verifyJWT, async(req,res)=>{
            const id= req.params.id;
            const query = {_id:ObjectId(id)};
            const result =await toolsCollection.deleteOne(query);
            res.send(result);
          })

          
        app.put('/user/:email',async(req,res)=>{
            const email =req.params.email;
            const user=req.body;
            const filter = { email:email };
            const options = { upsert: true };
            const updateDoc = {
              $set:user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token =jwt.sign({email:email},process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1d'});
            res.send({result,token});
  
          });

          app.put('/user/admin/:email', verifyJWT, async(req,res)=>{
            const email =req.params.email; 
            const requester =req.decoded.email; 
            const requesterAccount =await usersCollection.findOne({email:requester}) ; 
            if(requesterAccount.role === 'admin'){
              const filter = { email:email };          
            const updateDoc = {
              $set:{role:'admin'},
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
            }  
            else{
              res.status(403).send({message:'Forbidden'});
            }   
          })

          app.get('/admin/:email', async (req,res)=>{
            const email =req.params.email;
            const user = await usersCollection.findOne({email:email});
            const isAdmin = user.role == 'admin';
            res.send({admin:isAdmin});
          });
          app.delete('/user/:email', verifyJWT,verifyAdmin, async(req,res)=>{
            const email=req.params.email;
            const filter={email:email};
            const result =await usersCollection.deleteOne(filter);
            res.send(result);
          })



          app.get('/user',verifyJWT, async(req,res) =>{
            const users = await usersCollection.find().toArray();
            res.send(users);
          })


          app.post('/create-payment-intent',verifyJWT, async(req,res)=>{
            const service =req.body;
            const price=service.price;
            const amount=price*100;
            const paymentIntent =await stripe.paymentIntents.create({
              amount:amount,
              currency:'usd',
              payment_method_types:['card']
            });
            res.send({clientSecret:paymentIntent.client_secret});
          });

          app.patch('/order/:id', async(req,res)=>{
            const id =req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updatedDoc ={
              $set:{
                paid:true,
                transactionId:payment.transactionId
              }
            }
            const updatedBooking =await bookingCollection.updateOne(filter,updatedDoc);
            const result = await paymentCollection.insertOne(payment);
            res.send(updatedDoc);
  
          });


          
    }
    finally{

    }
}
run().catch(console.dir);


app.get('/',(req,res)=>{
    res.send('Hello from computer point')
})

app.listen(port,() => {
    console.log(`computer listening on port ${port}`)
})