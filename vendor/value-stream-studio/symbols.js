/* Original vector drawings of the mapping conventions shown in the supplied worksheet. */
window.VSM = (() => {
const shapes = {
 process:'<rect x="9" y="9" width="82" height="52"/><path d="M9 25h82"/>',
 source:'<path d="M7 61V22L35 8v14L63 8v14L91 8v53z"/>',
 service:'<path d="M14 7L32 22L50 7L68 22L86 7V63Q50 47 14 63z"/>',
 warehouse:'<rect x="12" y="8" width="76" height="54"/><path d="M12 27h76M24 62V43h14v19"/>',
 crossdock:'<rect x="8" y="7" width="84" height="57"/><path d="M8 26h84M18 37h22q16 0 16 14h22m-38-14q16 0 16 0h22M18 51h22q16 0 16-14M72 33l7 4-7 4m0 6 7 4-7 4"/>',
 data:'<rect x="10" y="5" width="80" height="60"/><path d="M10 20h80M10 35h80M10 50h80"/>',
 inventory:'<path d="M50 5L88 62H12z"/><path d="M42 26h16M50 26v24M42 50h16"/>',
 supermarket:'<path d="M76 7v56M22 7h54M22 26h54M22 45h54M22 63h54"/>',
 withdrawal:'<path d="M75 18A26 26 0 1 0 77 50"/><path d="M62 48l17-3-2 17"/>',
 sla:'<path d="M5 35h28a17 17 0 0 1 34 0h28M41 35a9 9 0 0 1 18 0 9 9 0 0 0-18 0"/>',
 fifo:'<path d="M3 16h94M3 54h94M70 35h22m-9-7 9 7-9 7"/><text x="35" y="42" font-size="20" stroke="none" fill="currentColor" text-anchor="middle">FIFO</text>',
 push:'<path d="M5 26h68V15l24 20-24 20V44H5z"/><path d="M15 26v18M30 26v18M45 26v18M60 26v18"/>',
 finished:'<path d="M5 29h68V16l24 19-24 19V41H5z"/>',
 truck:'<path d="M8 12h53v39H8zM61 27h20l12 14v10H61"/><circle cx="25" cy="55" r="7"/><circle cx="78" cy="55" r="7"/>',
 train:'<rect x="4" y="22" width="39" height="24" rx="3"/><rect x="56" y="22" width="39" height="24" rx="3"/><path d="M43 37h13M2 59h96"/><circle cx="16" cy="50" r="4"/><circle cx="33" cy="50" r="4"/><circle cx="67" cy="50" r="4"/><circle cx="84" cy="50" r="4"/>',
 plane:'<path d="M6 31l25 1L46 8h10L47 32l33 1q20 4 8 9H47l9 21H45L30 44H11L5 31z"/>',
 boat:'<path d="M4 40h92L80 57H20zM19 40V26h43V12h23v28M33 26V18h17v8M5 63q9-7 18 0t18 0t18 0t18 0t18 0"/>',
 rework:'<path d="M26 23a26 26 0 0 1 50 7M74 47a26 26 0 0 1-50-7M14 20l10 12 12-10M86 50L76 38 64 48"/>',
 milkrun:'<path d="M83 17C-8-9-20 69 85 53M72 44l17 8-18 9"/>',
 expedited:'<path d="M5 19Q50 84 92 19" stroke-dasharray="1 8" stroke-linecap="round"/><path d="M77 24l17-10-1 19"/>',
 manual:'<path d="M5 35h89M79 25l15 10-15 10"/>',
 electronic:'<path d="M5 35h35L32 20l38 15h24M79 25l15 10-15 10"/>',
 withdrawalKanban:'<path d="M12 61V35h22M69 35h26" stroke-dasharray="5 4"/><path d="M34 15h23l13 11v25H34zM34 29l13-14M34 41l25-24M38 51l30-29M51 51l19-18M64 51l6-7M6 53l6 10 6-10"/>',
 productionKanban:'<path d="M12 61V35h22M69 35h26" stroke-dasharray="5 4"/><path d="M34 15h23l13 11v25H34zM6 53l6 10 6-10"/>',
 batchKanban:'<path d="M42 9h27l16 12v24H58M31 17h27l16 12v24H47M20 25h27l16 12v24H20zM20 44H4m9-7-9 7 9 7M85 34h12"/>',
 phone:'<path d="M25 60V40l10-16h30l10 16v20zM22 28V16q28-19 56 0v12H65V19q-15-8-30 0v9z"/><circle cx="50" cy="43" r="10"/>',
 leveling:'<rect x="4" y="15" width="92" height="40"/><circle cx="18" cy="35" r="10"/><circle cx="62" cy="35" r="10"/><path d="M32 25l16 20m0-20L32 45m44-20 16 20m0-20L76 45"/>',
 kanbanPost:'<path d="M27 7l3 28h40l3-28M50 35v28M33 63h34"/>',
 signal:'<path d="M17 8h66L50 64z"/>',
 control:'<path d="M19 8h62v45H19zM8 53h84v11H8z"/>',
 schedule:'<rect x="10" y="7" width="80" height="56"/><path d="M10 22h80M26 3v11M74 3v11M24 35h14m9 0h14m9 0h9M24 48h14m9 0h14"/>',
 inbox:'<path d="M12 38h76v25H12zM20 28h59M20 21h59M20 14h59M20 7h59"/><text x="50" y="56" font-size="17" stroke="none" fill="currentColor" text-anchor="middle">IN</text>',
 delay:'<circle cx="50" cy="35" r="28"/><path d="M50 13v23h18"/>',
 operator:'<circle cx="50" cy="25" r="14"/><path d="M25 25a25 25 0 0 0 50 0M50 50v13"/>',
 gosee:'<ellipse cx="29" cy="45" rx="13" ry="16"/><ellipse cx="70" cy="45" rx="13" ry="16"/><path d="M16 44L25 12q5-8 11 0M83 44l9-29M42 42q7-9 15 0"/>',
 kaizen:'<path d="M7 27l16-4-1-13 18 8L51 3l9 14L80 6l-2 15 17 3-10 13 12 11-23 2-3 17-16-12-16 10-4-15-22 9 4-16L3 40z"/>',
 buffer:'<rect x="34" y="4" width="32" height="62"/><path d="M34 25h32M34 46h32"/>',
 milestone:'<path d="M3 35h94M14 27l8 8-8 8-8-8zM50 27l8 8-8 8-8-8zM86 27l8 8-8 8-8-8z"/>',
 timeline:'<path d="M4 47h18V22h24v25h22V22h27"/>',
 note:'<path d="M15 5h52l18 18v42H15zM67 5v18h18M27 36h46M27 47h36"/>'
};
const defs = [
['process','Process','Process & places','A step or work area in the value stream.'],['data','Data Box','Process & places','Record observed process data.'],['source','Outside Sources','Process & places','An external supplier or customer.'],['service','Service Customer/Supplier','Process & places','A customer or supplier in a service flow.'],['warehouse','Warehouse','Process & places','A location where material is stored.'],['crossdock','Cross-dock','Process & places','A transfer point between incoming and outgoing material.'],['inventory','Inventory','Material flow','Material or work waiting between steps.'],['supermarket','Supermarket','Material flow','Controlled inventory replenished after withdrawal.'],['withdrawal','Withdrawal','Material flow','Material pulled by a downstream process.'],['fifo','First-In-First-Out Sequence Flow','Material flow','Material moves in the order it entered.'],['push','PUSH Arrow','Material flow','Material moved to the next step without a downstream pull.'],['finished','Finished Goods to Customer','Material flow','Delivery of completed output to the customer.'],['buffer','Buffer or Safety Stock','Material flow','Stock held to protect against variation.'],['truck','Truck Shipment','Transport','Shipment by road.'],['train','Train Shipment','Transport','Shipment by rail.'],['plane','Plane Shipment','Transport','Shipment by air.'],['boat','Boat Shipment','Transport','Shipment by water.'],['milkrun','Milk Run','Transport','A recurring collection or delivery route.'],['expedited','Expedited Transport','Transport','Priority movement of material.'],['manual','Manual Information Flow','Information flow','Information exchanged manually.'],['electronic','Electronic Information Flow','Information flow','Information exchanged electronically.'],['phone','Phone','Information flow','Information exchanged by phone.'],['control','Control Center','Information flow','The point coordinating production or work.'],['schedule','Schedule','Information flow','Instructions about what to do and when.'],['inbox','Inventory/inbox','Information flow','Information or tasks waiting to be processed.'],['withdrawalKanban','Withdrawal Kanban','Pull & scheduling','A signal authorizing material withdrawal.'],['productionKanban','Production Kanban','Pull & scheduling','A signal authorizing production.'],['batchKanban','Kanban Arriving in Batches','Pull & scheduling','Multiple kanban arriving together.'],['signal','Signal Kanban','Pull & scheduling','A signal to begin a batch or replenish.'],['kanbanPost','Kanban Post','Pull & scheduling','A collection point for kanban signals.'],['leveling','Leveling Mix and/or Volume','Pull & scheduling','A repeating sequence that levels the work.'],['sla','Service Level Agreement','People & improvement','An agreed service target or response time.'],['rework','Rework','People & improvement','Work repeated to correct a defect.'],['delay','Delay Time','People & improvement','Time spent waiting.'],['operator','Operator','People & improvement','A person performing the work.'],['gosee','Go-See Scheduling','People & improvement','Scheduling informed by direct observation.'],['kaizen','Kaizen Lightning Burst','People & improvement','An opportunity for improvement.'],['milestone','Milestone Pacing','People & improvement','Milestones used to pace the work.'],['timeline','Timeline','Annotations','Add processing and waiting times below the flow.'],['note','Note','Annotations','Add an observation or explanation.']
];
const symbols=defs.map(([id,name,group,description])=>({id,name,group,description}));
function icon(type){return `<svg viewBox="0 0 100 70" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${shapes[type]||shapes.process}</g></svg>`}
return {shapes,symbols,icon};
})();
