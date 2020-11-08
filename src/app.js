const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)


function isContractOf(contract, profile) {
    return contract.ClientId == profile.id || contract.ContractorId == profile.id
}

async function getNonTerminatedContracts(profile) {
    
    const {Contract} = app.get('models')    

    if(profile.type === 'client') {
        return await Contract.findAll({    
            where: {
                status: ['new', 'in_progress'],
                ClientId: profile.id
            }
        })
    }

    if(profile.type === 'contractor') {
        return await Contract.findAll({    
            where: {
                status: ['new', 'in_progress'],
                ContractorId: profile.id
            }
        }) 
    }

    throw Error('Unknow type of profile')
}

async function getUnpaidJobs(profile) {

    const {Contract, Job} = app.get('models') 
    const jobs = []
    let contracts = []

    if(profile.type === 'client') {
        contracts = await Contract.findAll({    
            where: {
                status: 'in_progress',
                ClientId: profile.id
            },
            include: [{
                model: Job,
                where: {
                    paid: null
                }
            }]
        })
    }

    if(profile.type === 'contractor') {
        contracts = await Contract.findAll({    
            where: {
                status: 'in_progress',
                ContractorId: profile.id
            },
            include: [{
                model: Job,
                where: {
                    paid: null
                }
            }]
        }) 
    }    

    contracts.map(c => {
        c.Jobs.map(j => {
            jobs.push(j)
        })
    })

    return jobs;    
}

app.get('/' ,async (req, res) =>{    
    res.json('hello world')
})

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id',getProfile ,async (req, res) =>{
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const contract = await Contract.findOne({where: {id}})
    
    if(!contract) { 
        res.status(404).end()
    }

    if(!isContractOf(contract, req.profile)) {
        res.status(403).end()
    }

    res.json(contract)
})


app.get('/contracts', getProfile ,async (req, res) =>{    
    try {
        const contracts = await getNonTerminatedContracts(req.profile)
        res.json(contracts)
    } catch(e) {
        res.status(400).send(e.message)
    }
})

app.get('/jobs/unpaid', getProfile ,async (req, res) =>{    
    try {
        const jobs = await getUnpaidJobs(req.profile)
        res.json(jobs)
    } catch(e) {
        res.status(400).send(e.message)
    }
})

app.post('/jobs/:job_id/pay', getProfile ,async (req, res) =>{    
    try {
        const {Job, Profile} = req.app.get('models')        
        const {job_id} = req.params

        const job = await Job.findOne({where: {id: job_id}})
        
        if(!job) { 
            res.status(404).send('Job not found')
        }

        if(!(req.profile.balance > job.price)) {
            res.status(403).send('Insuficient money in account')
        }        

        contractor = await Profile.findOne({where: {id: job.ContractId}});
        contractor.balance += job.price;
        await contractor.save();

        client = await Profile.findOne({where: {id: req.profile.id}})
        client.balance -+ job.price;                
        await client.save();

        job.paid = true;
        job.paymentDate = new Date();
        await job.save();
        
        res.json(job)
    } catch(e) {
        res.status(400).send(e.message)
    }
})

module.exports = app;
