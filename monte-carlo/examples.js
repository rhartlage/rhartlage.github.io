export const baseline = {
  "type": "monte-carlo-studio",
  "schemaVersion": 1,
  "model": {
    "name": "Sanotronics — baseline",
    "description": "BUS-3150 Lecture 33 workbook adaptation. Price $249; fixed cost $1,000,000. Independent labor, parts and demand. Demand is continuous and unbounded: negative draws are intentionally retained. An Introduction to Management Science, 15e, §§12.1–12.2. Workbook: BUS-3150_Lecture_33(1).xlsx; this is the workbook sample, not the textbook illustrated run.",
    "inputs": [
      {
        "id": "price",
        "label": "Selling price ($/unit)",
        "type": "constant",
        "value": 249
      },
      {
        "id": "fixedCost",
        "label": "Fixed cost ($)",
        "type": "constant",
        "value": 1000000
      },
      {
        "id": "labor",
        "label": "Labor cost ($/unit)",
        "type": "discrete",
        "values": [
          {
            "value": 43,
            "probability": 0.1
          },
          {
            "value": 44,
            "probability": 0.2
          },
          {
            "value": 45,
            "probability": 0.4
          },
          {
            "value": 46,
            "probability": 0.2
          },
          {
            "value": 47,
            "probability": 0.1
          }
        ]
      },
      {
        "id": "parts",
        "label": "Parts cost ($/unit)",
        "type": "uniform",
        "min": 80,
        "max": 100
      },
      {
        "id": "demand",
        "label": "Demand (units)",
        "type": "normal",
        "mean": 15000,
        "sd": 4500
      }
    ],
    "outputs": [
      {
        "id": "contribution",
        "label": "Unit contribution ($/unit)",
        "formula": "price - labor - parts"
      },
      {
        "id": "profit",
        "label": "Profit ($)",
        "formula": "contribution * demand - fixedCost"
      }
    ],
    "settings": {
      "trials": 1000,
      "seed": 20261106,
      "riskOutput": "profit",
      "lossThreshold": 0,
      "target": 1000000
    },
    "traceUniforms": [
      0.9109,
      0.4576,
      0.6026
    ]
  },
  "comparisons": []
};
export function blank(){return {type:"monte-carlo-studio",schemaVersion:1,model:{name:"My model",description:"",inputs:[{id:"x",label:"Uncertain input",type:"uniform",min:0,max:1}],outputs:[{id:"result",label:"Result",formula:"x"}],settings:{trials:1000,seed:20261106,riskOutput:"result",lossThreshold:0,target:0.5},traceUniforms:[0.5]},comparisons:[]};}
