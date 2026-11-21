// Frozen answer key: 20 lecture moments. Each limit is computed here by exact maths, not typed in.
const bis=(f,lo,hi)=>{for(let i=0;i<80;i++){const m=(lo+hi)/2;if(f(m))hi=m;else lo=m;}return (lo+hi)/2;};
const agm=(a,b)=>{for(let i=0;i<40;i++){[a,b]=[(a+b)/2,Math.sqrt(a*b)];}return a;};
const d=Math.PI/180, g=9.81;
const dragT=(h,m,r)=>{const k=.5*1.225*.47*Math.PI*r*r,vt=Math.sqrt(m*g/k);return vt/g*Math.acosh(Math.exp(h*g/(vt*vt)));};
module.exports=[
 {id:1, line:"For small swings the period is two pi root L over g. The mass isn't in there.", verdict:"holds", limit:null, unit:null},
 {id:2, line:"It doesn't matter how far you pull the pendulum back, the period is the same.", verdict:"breaks", unit:"deg", limit:bis(a=>1/agm(1,Math.cos(a*d/2))-1>0.01,1,90)},
 {id:3, line:"A heavy ball and a light ball dropped together land at the same time (bowling 7.0 kg r 0.109 m, basketball 0.62 kg r 0.119 m).", verdict:"breaks", unit:"m", limit:bis(h=>dragT(h,.62,.119)/dragT(h,7,.109)-1>0.01,.1,500)},
 {id:4, line:"For small angles, sin x is just x.", verdict:"breaks", unit:"deg", limit:bis(a=>a*d/Math.sin(a*d)-1>0.01,.1,89)},
 {id:5, line:"For small angles, tan x is just x.", verdict:"breaks", unit:"deg", limit:bis(a=>Math.tan(a*d)/(a*d)-1>0.01,.1,89)},
 {id:6, line:"For small x, e to the x is about 1 plus x.", verdict:"breaks", unit:"x", limit:bis(x=>Math.exp(x)/(1+x)-1>0.01,1e-4,2)},
 {id:7, line:"Kinetic energy is one half m v squared.", verdict:"breaks", unit:"fraction of c", limit:bis(b=>(1/Math.sqrt(1-b*b)-1)/(.5*b*b)-1>0.01,1e-4,.99)},
 {id:8, line:"Near Earth's surface, g is constant, 9.81, whatever the height.", verdict:"breaks", unit:"km", limit:bis(hk=>1-Math.pow(6371/(6371+hk),2)>0.01,0,1000)},
 {id:9, line:"A mass on an ideal spring has the same period whatever the amplitude.", verdict:"holds", limit:null, unit:null},
 {id:10, line:"The rule of 72: money doubles in 72 divided by the interest rate years.", verdict:"breaks", unit:"% rate", limit:bis(r=>Math.abs((72/r)/(Math.log(2)/Math.log(1+r/100))-1)>0.01,8,60), limitLow:bis(r=>!(Math.abs((72/r)/(Math.log(2)/Math.log(1+r/100))-1)>0.01),0.5,7.8)},
 {id:11, line:"In a vacuum, all objects fall with the same acceleration.", verdict:"holds", limit:null, unit:null},
 {id:12, line:"(1 plus x) to the n is about 1 plus n x, here n = 2.", verdict:"breaks", unit:"x", limit:bis(x=>Math.pow(1+x,2)/(1+2*x)-1>0.01,1e-4,2)},
 {id:13, line:"Kepler: the square of the orbit period is proportional to the cube of the orbit size (planet mass ignored).", verdict:"holds", limit:null, unit:null},
 {id:14, line:"Without air, a projectile goes furthest launched at 45 degrees, from ground level.", verdict:"holds", limit:null, unit:null},
 {id:15, line:"cos x is about 1 minus x squared over 2.", verdict:"breaks", unit:"deg", limit:bis(a=>Math.abs((1-Math.pow(a*d,2)/2)/Math.cos(a*d)-1)>0.01,.1,80)},
 {id:16, line:"ln of 1 plus x is about x.", verdict:"breaks", unit:"x", limit:bis(x=>x/Math.log(1+x)-1>0.01,1e-4,2)},
 {id:17, line:"Momentum is m times v.", verdict:"breaks", unit:"fraction of c", limit:bis(b=>1/Math.sqrt(1-b*b)-1>0.01,1e-4,.99)},
 {id:18, line:"The square root of 1 plus x is about 1 plus x over 2.", verdict:"breaks", unit:"x", limit:bis(x=>(1+x/2)/Math.sqrt(1+x)-1>0.01,1e-4,3)},
 {id:19, line:"Energy is conserved in a frictionless pendulum.", verdict:"holds", limit:null, unit:null},
 {id:20, line:"A ball thrown straight up with no air takes the same time to go up as to come down.", verdict:"holds", limit:null, unit:null},
];
if (require.main===module) for (const k of module.exports) console.log(k.id, k.verdict, k.limit===null?'-':k.limit.toFixed(3), k.unit||'');
