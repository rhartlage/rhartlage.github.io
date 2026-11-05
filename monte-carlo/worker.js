import {run,runComparisons} from './engine.js';
self.onmessage=({data})=>{try{const active=run(data.model),comparisons=runComparisons(data);self.postMessage({active,comparisons});}catch(error){self.postMessage({error:error.message});}};
