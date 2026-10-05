import { closestOnSegment, pointInPolygon } from './physics.js';

export function createRoadNetwork(map) {
  const segments=[];
  for(const road of map.roads)for(let i=1;i<road.p.length;i++){
    const a=road.p[i-1],b=road.p[i];
    if(Math.hypot(b[0]-a[0],b[1]-a[1])>.1)segments.push({a,b,road});
  }
  const buildingGrid=new Map(), CELL=32;
  const bounds=p=>({minX:Math.min(...p.map(q=>q[0])),maxX:Math.max(...p.map(q=>q[0])),minZ:Math.min(...p.map(q=>q[1])),maxZ:Math.max(...p.map(q=>q[1]))});
  const buildings=map.buildings.map(p=>({p,...bounds(p)}));
  for(const building of buildings){
    for(let x=Math.floor(building.minX/CELL);x<=Math.floor(building.maxX/CELL);x++)
      for(let z=Math.floor(building.minZ/CELL);z<=Math.floor(building.maxZ/CELL);z++){
        const k=`${x},${z}`;if(!buildingGrid.has(k))buildingGrid.set(k,[]);buildingGrid.get(k).push(building);
      }
  }
  function hitsBuilding(x,z,r=1){
    const candidate=new Set();
    for(let i=Math.floor((x-r)/CELL);i<=Math.floor((x+r)/CELL);i++)
      for(let j=Math.floor((z-r)/CELL);j<=Math.floor((z+r)/CELL);j++)
        for(const b of buildingGrid.get(`${i},${j}`)||[])candidate.add(b);
    for(const b of candidate){
      if(x+r<b.minX||x-r>b.maxX||z+r<b.minZ||z-r>b.maxZ)continue;
      const inside=pointInPolygon(x,z,b.p);
      let near=null;
      for(let i=0;i<b.p.length;i++){
        const q=closestOnSegment(x,z,b.p[i],b.p[(i+1)%b.p.length]);
        if(!near||q.d<near.d)near=q;
      }
      if(inside||near.d<r){
        const d=near.d||.001;
        const sign=inside?-1:1;
        return {nx:(x-near.x)/d*sign,nz:(z-near.z)/d*sign,depth:inside?r+d:r-d};
      }
    }
    return null;
  }
  function carCollision(s,spec){
    const f=[-Math.sin(s.heading),-Math.cos(s.heading)];
    const radius=spec.width*.46;
    for(const offset of [-spec.length*.3,0,spec.length*.3]){
      const hit=hitsBuilding(s.x+f[0]*offset,s.z+f[1]*offset,radius);
      if(hit)return hit;
    }
    return null;
  }
  function nearest(x,z,drivable=false){
    let best=null;
    for(const s of segments){
      if(drivable&&(s.road.w<3.5||['footway','path','steps','cycleway'].includes(s.road.kind)))continue;
      const q=closestOnSegment(x,z,s.a,s.b);
      if(!best||q.d<best.d)best={...q,segment:s,road:s.road};
    }
    return best;
  }
  // Road endpoints retain OSM intersections. Short subdivisions support narrow-street AI.
  const nodes=[],grid=new Map();
  function nodeAt(x,z){
    const gx=Math.floor(x/3),gz=Math.floor(z/3);
    for(let a=gx-1;a<=gx+1;a++)for(let b=gz-1;b<=gz+1;b++){
      for(const id of grid.get(`${a},${b}`)||[]){const n=nodes[id];if(Math.hypot(n.x-x,n.z-z)<2.3)return id;}
    }
    const id=nodes.length;nodes.push({x,z,links:[]});const k=`${gx},${gz}`;
    if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);return id;
  }
  for(const {a,b,road} of segments){
    if(road.w<3.5||['footway','path','steps','cycleway'].includes(road.kind))continue;
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(len/12);
    let last=null;
    for(let i=0;i<=n;i++){
      const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;
      if(hitsBuilding(x,z,.7)){last=null;continue;}
      const id=nodeAt(x,z);
      if(last!==null&&last!==id){
        const p=nodes[last],q=nodes[id],cost=Math.hypot(q.x-p.x,q.z-p.z);
        if(!hitsBuilding((p.x+q.x)/2,(p.z+q.z)/2,.8)){
          const add=(node,id)=>{const existing=node.links.find(l=>l.id===id);if(existing)existing.width=Math.max(existing.width,road.w);else node.links.push({id,cost,width:road.w});};
          add(p,id);add(q,last);
        }
      }
      last=id;
    }
  }
  function nearestNode(x,z){
    let best=0,dist=Infinity;
    for(let i=0;i<nodes.length;i++){
      if(!nodes[i].links.length)continue;
      const d=(nodes[i].x-x)**2+(nodes[i].z-z)**2;
      if(d<dist){dist=d;best=i;}
    }
    return best;
  }
  function path(from,to,spec=null,linkClear=null){
    const start=nearestNode(from.x,from.z),end=nearestNode(to.x,to.z);
    if(start===end)return [{x:nodes[end].x,z:nodes[end].z}];
    const open=new Set([start]),previous=new Map(),score=new Map([[start,0]]),f=new Map([[start,0]]);
    let count=0;
    while(open.size&&count++<10000){
      let current=null,best=Infinity;
      for(const id of open)if(f.get(id)<best){best=f.get(id);current=id;}
      if(current===end){
        const ids=[end];while(previous.has(ids[0]))ids.unshift(previous.get(ids[0]));
        return ids.map(id=>({x:nodes[id].x,z:nodes[id].z}));
      }
      open.delete(current);
      for(const link of nodes[current].links){
        if(spec){
          if(link.width<spec.width+.6)continue;
          const a=nodes[current],b=nodes[link.id],heading=Math.atan2(-(b.x-a.x),-(b.z-a.z)),samples=Math.ceil(link.cost/2);
          let clear=true;
          for(let i=0;i<=samples;i++)if(carCollision({x:a.x+(b.x-a.x)*i/samples,z:a.z+(b.z-a.z)*i/samples,heading},{...spec,width:spec.width+.35})){clear=false;break;}
          if(!clear)continue;
        }
        if(linkClear&&!linkClear(nodes[current],nodes[link.id]))continue;
        const cost=score.get(current)+link.cost;
        if(cost>=(score.get(link.id)??Infinity))continue;
        previous.set(link.id,current);score.set(link.id,cost);
        f.set(link.id,cost+Math.hypot(nodes[link.id].x-nodes[end].x,nodes[link.id].z-nodes[end].z));open.add(link.id);
      }
    }
    return [];
  }
  const lands=[...map.land.map(p=>({p:[p]})),...map.areas.filter(a=>a.k==='land')];
  function onLand(x,z){
    if(lands.some(a=>pointInPolygon(x,z,a.p[0])&&!a.p.slice(1).some(p=>pointInPolygon(x,z,p))))return true;
    const n=nearest(x,z);return n&&n.d<n.road.w/2+1.8;
  }
  return {map,segments,nodes,nearest,nearestNode,path,hitsBuilding,carCollision,onLand};
}
