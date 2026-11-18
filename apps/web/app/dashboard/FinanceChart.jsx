"use client";
import {useEffect,useRef} from "react";
import {money,cents} from "../../lib/finance";
const palette={coral:"#FA6A43",dark:"#1B1C18",green:"#169966",grey:"#DFE2DE"};
export default function FinanceChart({type="line",data=[],height=270}){
 const node=useRef(null);
 useEffect(()=>{
  let instance=null,cancelled=false,observer;
  (async()=>{
   const echarts=await import("echarts");
   if(cancelled||!node.current)return;
   instance=echarts.init(node.current,null,{renderer:"svg"});
   let options={animationDuration:480,backgroundColor:"transparent",textStyle:{fontFamily:"Inter,system-ui,sans-serif",fontSize:12},tooltip:{trigger:type==="donut"?"item":"axis",backgroundColor:"#fff",borderColor:"#E8E9E6",borderWidth:1,extraCssText:"border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.06)",formatter:params=>{
    if(!Array.isArray(params)){return params.name+": "+money(params.value);}
    return params.map(p=>p.marker+" "+p.seriesName+": <b>"+money(p.data)+"</b>").join("<br/>");
   }}};
   if(type==="donut"){
    const series=data.map(item=>({name:item.name,value:cents(item.value)})).filter(x=>x.value>0);
    options={...options,tooltip:{...options.tooltip,trigger:"item",formatter:p=>p.name+": "+money(p.value)},legend:{type:"scroll",bottom:0,icon:"circle",textStyle:{color:"#7B7E79"}},color:[palette.coral,palette.dark,"#7F98A4","#F8C5AB","#9AC3A0","#CACAC6"],series:[{name:"Categorias",type:"pie",radius:["56%","80%"],center:["50%","43%"],avoidLabelOverlap:true,label:{show:false},itemStyle:{borderColor:"#fff",borderWidth:4,borderRadius:7},data:series}]};
   }else{
    const months=data.map(i=>i.label);
    const commonAxis={axisTick:{show:false},axisLine:{show:false},axisLabel:{color:"#92958E",fontSize:11},splitLine:{show:false}};
    options={...options,grid:{left:10,right:12,top:28,bottom:28,containLabel:true},xAxis:{type:"category",data:months,boundaryGap:type!=="line",...commonAxis},yAxis:{type:"value",...commonAxis,splitLine:{show:true,lineStyle:{color:"#ECEDE9",type:"dashed"}},axisLabel:{formatter:v=>v>=1000?(v/1000).toFixed(0)+" mil":String(v)}},legend:{show:false}};
    if(type==="line"){
     const hasWithin=data.some(i=>i.balanceWithinBudgets!==null&&i.balanceWithinBudgets!==undefined&&i.balanceWithinBudgets!==i.balance);
     options.series=[{name:"Contratual",type:"line",data:data.map(i=>cents(i.balance)/100),smooth:.22,symbol:"circle",symbolSize:5,lineStyle:{width:3.3,color:palette.coral},itemStyle:{color:palette.coral},areaStyle:{color:{type:"linear",x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:"rgba(250,106,67,.24)"},{offset:1,color:"rgba(250,106,67,.015)"}]}}}];
     if(hasWithin){
      options.series.push({name:"Com limites",type:"line",data:data.map(i=>cents(i.balanceWithinBudgets)/100),smooth:.22,symbol:"none",lineStyle:{width:2,type:"dashed",color:palette.dark},itemStyle:{color:palette.dark}});
      options.legend={show:true,top:0,right:8,itemWidth:12,itemHeight:8,textStyle:{fontSize:11,color:"#858985"}};
     }
     options.tooltip.formatter=p=>p.axisValueLabel+"<br/>"+p.map(q=>q.marker+" "+q.seriesName+": <b>"+money(Math.round(Number(q.data)*100))+"</b>").join("<br/>");
    }else{
     options.color=[palette.coral,palette.dark];
     options.series=[{name:"Receitas",type:"bar",barMaxWidth:23,itemStyle:{color:palette.coral,borderRadius:[6,6,0,0]},data:data.map(i=>cents(i.income)/100)},{name:"Despesas",type:"bar",barMaxWidth:23,itemStyle:{color:palette.dark,borderRadius:[6,6,0,0]},data:data.map(i=>cents(i.expense)/100)}];
     options.tooltip.formatter=p=>p.map(q=>q.marker+" "+q.seriesName+": <b>"+money(Math.round(Number(q.data)*100))+"</b>").join("<br/>");
     options.legend={show:true,top:0,right:8,itemWidth:9,itemHeight:9,textStyle:{fontSize:11,color:"#858985"}};
    }
   }
   instance.setOption(options,{notMerge:true});
   if(typeof ResizeObserver!=="undefined"){observer=new ResizeObserver(()=>instance?.resize());observer.observe(node.current);}
  })();
  return()=>{cancelled=true;observer?.disconnect();instance?.dispose();};
 },[type,JSON.stringify(data)]);
 return <div ref={node} style={{width:"100%",height:height}} role="img" aria-label={type==="line"?"Gráfico de saldo projetado":type==="donut"?"Distribuição de despesas por categoria":"Receitas e despesas mensais"}/>;
}
