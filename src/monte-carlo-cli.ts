import {readFile} from 'node:fs/promises';
import {parsePortfolio} from './portfolio.js';
import {simulatePortfolio} from './monte-carlo.js';
try{
 const args=process.argv.slice(2),file=args.shift();
 if(!file||file.startsWith('--'))throw new Error('Usage: monte-carlo-cli plan.json [--samples 5000] [--seed 2026]');
 const options:{samples?:number;seed?:number}={};
 while(args.length){const flag=args.shift(),value=args.shift();if((flag!=='--samples'&&flag!=='--seed')||value===undefined)throw new Error('Use only --samples and --seed; P100 is not supported');options[flag==='--samples'?'samples':'seed']=Number(value);}
 const value=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 console.log(JSON.stringify(simulatePortfolio(parsePortfolio(value.sourcePlan??value.plan??value),options),null,2));
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
