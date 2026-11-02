/* Local storage and backup operations. No network or runtime dependencies. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.StudioStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RECORDS=['materials','clays','pieces','inspo'];
  const STORES=RECORDS.concat('images');
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
  function invalid(message){
    const e=new Error(message); e.name='BackupValidationError'; throw e;
  }
  function check(ok,message){ if(!ok) invalid(message); }

  /* Request success is earlier than transaction commit. Resolve only on commit,
     and abort even when a synchronous queueing error follows earlier writes. */
  function transaction(db,stores,mode,queue){
    return new Promise((resolve,reject)=>{
      let tx;
      try{ tx=db.transaction(stores,mode); }catch(e){ reject(e); return; }
      let value, failure;
      tx.oncomplete=()=>resolve(value);
      tx.onabort=()=>reject(failure||tx.error||new DOMException('Storage operation cancelled','AbortError'));
      tx.onerror=e=>{ failure=failure||(e.target&&e.target.error)||tx.error; };
      const fail=e=>{
        failure=e;
        try{ tx.abort(); }catch(_){ reject(e); }
      };
      try{ queue(tx,v=>{ value=v; },fail); }catch(e){ fail(e); }
    });
  }
  function put(db,store,record){
    return transaction(db,[store],'readwrite',(tx,done)=>{
      tx.objectStore(store).put(record); done(record);
    });
  }
  function snapshot(db){
    return transaction(db,STORES,'readonly',(tx,done)=>{
      const out={};
      STORES.forEach(s=>{ tx.objectStore(s).getAll().onsuccess=e=>{ out[s]=e.target.result; }; });
      done(out);
    });
  }
  function clear(db){
    return transaction(db,STORES,'readwrite',tx=>{ STORES.forEach(s=>tx.objectStore(s).clear()); });
  }
  function imageIds(store,record){
    if(!record) return [];
    if(store==='pieces') return record.photos||[];
    return record.imageId?[record.imageId]:[];
  }

  /* Apply record edits/deletions and remove their unused photos together.
     Only former photos of the changed records are candidates, so an unsaved
     photo currently being edited elsewhere is never swept up. */
  function changeRecords(db,changes){
    return transaction(db,STORES,'readwrite',(tx,done,fail)=>{
      const current={}; let remaining=RECORDS.length;
      RECORDS.forEach(s=>{
        tx.objectStore(s).getAll().onsuccess=e=>{
          current[s]=new Map(e.target.result.map(r=>[r.id,r]));
          if(--remaining) return;
          try{
            const candidates=new Set();
            for(const change of changes){
              const {store,id,record}=change;
              if(!RECORDS.includes(store)) throw new Error('Unknown record store');
              imageIds(store,current[store].get(id)).forEach(x=>candidates.add(x));
              if(record){
                if(record.id!==id) throw new Error('Record identifier changed');
                tx.objectStore(store).put(record); current[store].set(id,record);
              }else{
                tx.objectStore(store).delete(id); current[store].delete(id);
              }
            }
            const used=new Set();
            for(const s of RECORDS) for(const r of current[s].values()) imageIds(s,r).forEach(x=>used.add(x));
            const removed=[...candidates].filter(id=>!used.has(id));
            removed.forEach(id=>tx.objectStore('images').delete(id));
            done(removed);
          }catch(error){ fail(error); }
        };
      });
    });
  }

  function optionalString(record,keys){
    keys.forEach(k=>{ if(record[k]!=null) check(typeof record[k]==='string','Invalid '+k+' field.'); });
  }
  function optionalNumber(record,keys){
    keys.forEach(k=>{ if(record[k]!=null) check(typeof record[k]==='number'&&Number.isFinite(record[k]),'Invalid '+k+' field.'); });
  }
  function optionalReference(record,key){
    if(record[key]!=null&&record[key]!=='') check(validId(record[key]),'Invalid '+key+' reference.');
  }
  function validateRecord(store,r){
    check(object(r)&&validId(r.id),'A record is missing a valid identifier.');
    optionalString(r,['name','type','cone','brand','code','method','notes','supplier','coneRange','colorRaw','colorFired','stage','note']);
    optionalNumber(r,['updated','created','taken','added']);
    optionalReference(r,'imageId'); optionalReference(r,'clayId');
    ['colorHex','colorFiredHex'].forEach(k=>{
      if(r[k]!=null&&r[k]!=='') check(typeof r[k]==='string'&&/^#[\da-f]{3,8}$/i.test(r[k]),'Invalid swatch color.');
    });
    if(r.foodSafe!=null) check(typeof r.foodSafe==='boolean','Invalid food-safe field.');
    if(store==='materials'&&r.recipe!=null){
      check(Array.isArray(r.recipe),'Invalid recipe.');
      r.recipe.forEach(row=>{
        check(object(row),'Invalid recipe row.'); optionalString(row,['material']);
        if(row.pct!=null) check(typeof row.pct==='string'||(typeof row.pct==='number'&&Number.isFinite(row.pct)),'Invalid recipe percentage.');
      });
    }
    if(store==='pieces'){
      check(Array.isArray(r.photos)&&r.photos.every(validId)&&new Set(r.photos).size===r.photos.length,'Invalid piece photos.');
      check(Array.isArray(r.pins),'Invalid glaze marks.');
      const pins=new Set();
      r.pins.forEach(p=>{
        check(object(p)&&validId(p.id)&&!pins.has(p.id),'Invalid or repeated glaze mark.'); pins.add(p.id);
        check(validId(p.photoId)&&r.photos.includes(p.photoId),'A glaze mark has no matching photo.');
        check(['x','y'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1),'Invalid glaze-mark position.');
        optionalString(p,['note']);
        check(Array.isArray(p.layers),'Invalid glaze layers.');
        p.layers.forEach(l=>{
          check(object(l)&&validId(l.materialId),'Invalid glaze layer.'); optionalString(l,['method']);
          if(l.coats!=null) check(typeof l.coats==='string'||(typeof l.coats==='number'&&Number.isFinite(l.coats)),'Invalid coat count.');
        });
      });
    }
    if(store==='inspo'){
      check(validId(r.imageId),'An inspiration photo is missing.');
      check(Array.isArray(r.tags)&&r.tags.every(x=>typeof x==='string'),'Invalid photo tags.');
    }
  }
  function decodePhoto(im){
    check(object(im)&&validId(im.id),'Invalid photo identifier.');
    check(['w','h'].every(k=>Number.isInteger(im[k])&&im[k]>0),'Invalid photo dimensions.');
    optionalNumber(im,['taken']);
    check(typeof im.data==='string'&&im.data.length>0&&im.data.length%4===0&&
      !/[^A-Za-z0-9+/]/.test(im.data.replace(/={1,2}$/,'')),'A backup photo is damaged.');
    let bin;
    try{ bin=atob(im.data); }catch(_){ invalid('A backup photo is damaged.'); }
    /* All v1 Studio exports use JPEG. Check the JPEG boundaries before any
       writes; the app also decodes every image to catch corrupt image bodies. */
    check(bin.length>=4&&bin.charCodeAt(0)===255&&bin.charCodeAt(1)===216&&
      bin.charCodeAt(bin.length-2)===255&&bin.charCodeAt(bin.length-1)===217,'A backup photo is not a complete JPEG.');
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return {id:im.id,w:im.w,h:im.h,taken:im.taken||null,blob:new Blob([bytes],{type:'image/jpeg'})};
  }
  function prepareBackup(input){
    check(object(input)&&input.app==='studio','Choose a Studio backup file.');
    check(input.version===1,'This backup version is not supported.');
    check(object(input.records),'The backup has no records.');
    const records={};
    RECORDS.forEach(s=>{
      check(own(input.records,s)&&Array.isArray(input.records[s]),'The backup is missing '+s+'.');
      const ids=new Set();
      records[s]=input.records[s].map(r=>{
        validateRecord(s,r);
        check(!ids.has(r.id),'The backup contains repeated '+s+' identifiers.'); ids.add(r.id);
        return r;
      });
    });
    check(Array.isArray(input.images),'The backup is missing photos.');
    const imageSet=new Set();
    const images=input.images.map(im=>{
      const photo=decodePhoto(im);
      check(!imageSet.has(photo.id),'The backup contains repeated photo identifiers.');
      imageSet.add(photo.id); return photo;
    });
    for(const s of RECORDS) for(const r of records[s])
      imageIds(s,r).forEach(id=>check(imageSet.has(id),'The backup is missing a referenced photo.'));
    return {records,images};
  }
  function restore(db,prepared){
    return transaction(db,STORES,'readwrite',tx=>{
      for(const s of RECORDS) prepared.records[s].forEach(r=>tx.objectStore(s).put(r));
      prepared.images.forEach(im=>tx.objectStore('images').put(im));
    });
  }
  return {RECORDS,STORES,transaction,put,snapshot,clear,changeRecords,prepareBackup,restore};
});
