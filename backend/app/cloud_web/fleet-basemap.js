// Public Natural Earth geometry served with the portal. The entire detail file is
// requested by zoom level alone, so viewing a hub never transmits its location.
window.createFleetBasemap = (map, hubMarkers, setError) => {
 const detailZoom=3;
 const layers=[['land','land'],['water','water'],['border','border'],['disputed','border-disputed']];
 const regionNames=typeof Intl.DisplayNames==='function'?new Intl.DisplayNames('nb',{type:'region',fallback:'none'}):null;
 let overview=null,detail=null,overviewRequest=null,detailRequest=null,detailFailed=false,visibleGeometry=null;
 const labelPane=map.createPane('fleet-map-labels');
 labelPane.className+=' fleet-map-label-pane';
 labelPane.setAttribute('aria-hidden','true');
 const labels=L.layerGroup().addTo(map);

 async function readMap(file){
  const request=await fetch('/assets/'+file);
  if(!request.ok)throw Error('Kartgrunnlaget kunne ikke lastes.');
  const data=await request.json();
  const geometry=[];
  for(const [key,style] of layers){
   if(data[key])geometry.push(L.geoJSON(data[key],{interactive:false,className:'fleet-map-'+style}));
  }
  return {geometry:L.layerGroup(geometry),countries:data.countries,cities:data.cities};
 }

 function drawLabels(){
  if(!overview)return;
  const zoom=map.getZoom(),size=map.getSize(),bounds=map.getBounds();
  const countryRank=zoom<1?2:zoom<2?3:zoom<3?4:7;
  const cityRank=zoom<4?0:zoom<5?1:zoom<6?2:3;
  const occupied=[[0,0,56,91],[0,size.y-33,115,size.y]];
  for(const marker of hubMarkers.getLayers()){
   const point=marker.getLatLng();
   if(!bounds.contains(point))continue;
   const {x,y}=map.latLngToContainerPoint(point);
   occupied.push([x-18,y-18,x+18,y+18]);
  }

  labels.clearLayers();
  function addLabel(point,name,kind){
   if(!bounds.contains(point))return;
   const {x,y}=map.latLngToContainerPoint(point);
   const country=kind==='country';
   const width=Math.min(210,Math.max(30,name.length*(country?7.4:6.3)+16));
   const left=country?x-width/2:x-3;
   const box=[left,y-10,left+width,y+10];
   if(box[0]<6||box[1]<6||box[2]>size.x-6||box[3]>size.y-6)return;
   if(occupied.some(other=>box[0]<other[2]&&box[1]<other[3]&&box[2]>other[0]&&box[3]>other[1]))return;
   occupied.push(box);
   const text=document.createElement('span');
   text.textContent=name;
   const icon=L.divIcon({className:'fleet-map-name '+kind,iconSize:[0,0],html:text});
   L.marker(point,{pane:'fleet-map-labels',keyboard:false,interactive:false,icon}).addTo(labels);
  }
  if(zoom<6){
   for(const [lat,lon,name,code,rank] of overview.countries){
    if(rank<=countryRank)addLabel([lat,lon],(code&&regionNames?.of(code))||name,'country');
   }
  }
  if(detail&&zoom>=detailZoom){
   for(const [lat,lon,name,rank] of detail.cities){
    if(rank>cityRank)break;
    addLabel([lat,lon],name,'city');
   }
  }
 }

 function updateView(){
  if(!overview)return;
  const zoomedIn=map.getZoom()>=detailZoom;
  const atlas=zoomedIn&&detail?detail:overview;
  if(atlas.geometry!==visibleGeometry){
   if(visibleGeometry)map.removeLayer(visibleGeometry);
   visibleGeometry=atlas.geometry.addTo(map);
   map.getContainer().classList.toggle('fleet-map-detail',atlas===detail);
  }
  drawLabels();
  if(zoomedIn&&!detail&&!detailRequest&&!detailFailed){
   detailRequest=readMap('world-detail.json').then(data=>{
    detail=data;
    updateView();
   }).catch(()=>{
    detailFailed=true;
    setError('Detaljkartet kunne ikke lastes. Oversiktskartet vises.');
   }).finally(()=>{detailRequest=null;});
  }
 }

 map.on('moveend',updateView);
 return {
  async load(){
   if(!overviewRequest){
    overviewRequest=readMap('world-overview.json').then(data=>{overview=data;}).catch(error=>{overviewRequest=null;throw error;});
   }
   await overviewRequest;
   detailFailed=false;
   updateView();
  },
  drawLabels,
 };
};
