import {parentPort,workerData} from 'node:worker_threads';
import {simulatePortfolio} from './monte-carlo.js';
try{parentPort!.postMessage({result:simulatePortfolio(workerData.plan,workerData.options)});}
catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:String(error)});}
