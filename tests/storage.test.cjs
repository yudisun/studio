const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const storage=require('../storage.js');
const jpeg=fs.readFileSync(path.join(__dirname,'fixtures/photo.jpg'));
let db;
beforeEach(async()=>{
  db=await new Promise((resolve,reject)=>{
    const req=new IDBFactory().open('studio',1);
    req.onupgradeneeded=()=>storage.STORES.forEach(s=>req.result.createObjectStore(s,{keyPath:'id'}));
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
});
afterEach(()=>db.close());
function backup(){
  return {app:'studio',version:1,exported:'2026-08-09T00:00:00.000Z',records:{
    materials:[{id:'glaze-1',name:'Celadon',recipe:[{material:'Feldspar',pct:'100'}]}],
    clays:[{id:'clay-1',name:'Stoneware'}],
    pieces:[{id:'piece-1',name:'Bowl',clayId:'clay-1',photos:['photo-1'],pins:[
      {id:'pin-1',photoId:'photo-1',x:.3,y:.5,layers:[{materialId:'glaze-1',coats:'2',method:'brush'}]}
    ],stage:'Drying',firing:{cone:'6'},created:12345}],
    inspo:[{id:'inspo-1',imageId:'photo-1',tags:['form'],note:''}]
  },images:[{id:'photo-1',w:2,h:2,data:jpeg.toString('base64')}]};
}
async function baseline(){
  await storage.put(db,'pieces',{id:'piece-1',name:'Original',photos:['original-photo'],pins:[]});
  await storage.put(db,'images',{id:'original-photo',w:2,h:2,blob:new Blob([jpeg])});
  await storage.put(db,'materials',{id:'unrelated',name:'Keep me'});
}
async function comparableSnapshot(){
  const result=await storage.snapshot(db);
  result.images=await Promise.all(result.images.map(async im=>({...im,blob:Buffer.from(await im.blob.arrayBuffer()).toString('base64')})));
  return result;
}
/* Abort after a successful request, while the transaction is still uncommitted. */
function abortAfterWrite(storeName){
  return {transaction(...args){
    const tx=db.transaction(...args), objectStore=tx.objectStore.bind(tx);
    tx.objectStore=s=>{
      const store=objectStore(s);
      if(s===storeName){
        const put=store.put.bind(store);
        store.put=(...params)=>{
          const req=put(...params);
          req.addEventListener('success',()=>tx.abort(),{once:true});
          return req;
        };
      }
      return store;
    };
    return tx;
  }};
}

test('application scripts parse and load storage before the app',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../studio.html'),'utf8');
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.ok(html.indexOf('src="storage.js"')<html.indexOf('<script>'));
});
test('restores existing v1 backups and preserves legacy fields and unrelated records',async()=>{
  await baseline();
  await storage.restore(db,storage.prepareBackup(backup()));
  const result=await storage.snapshot(db);
  assert.equal(result.pieces[0].name,'Bowl');
  assert.equal(result.pieces[0].stage,'Drying');
  assert.deepEqual(result.pieces[0].firing,{cone:'6'});
  assert.equal(result.materials.find(m=>m.id==='unrelated').name,'Keep me');
  assert.deepEqual(Buffer.from(await result.images.find(im=>im.id==='photo-1').blob.arrayBuffer()),jpeg);
});
test('restored photos, glaze order, and capture dates survive another backup round trip',async()=>{
  const input=backup(); input.images[0].taken=654321;
  input.records.pieces[0].pins[0].layers.push({materialId:'deleted-glaze',coats:1,method:'dip'});
  await storage.restore(db,storage.prepareBackup(input));
  const saved=await storage.snapshot(db);
  const exported={app:'studio',version:1,records:{},images:[]};
  storage.RECORDS.forEach(s=>exported.records[s]=saved[s]);
  for(const im of saved.images) exported.images.push({id:im.id,w:im.w,h:im.h,taken:im.taken,data:Buffer.from(await im.blob.arrayBuffer()).toString('base64')});
  const roundTrip=storage.prepareBackup(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(roundTrip.records,input.records);
  assert.equal(roundTrip.images[0].taken,654321);
});
test('rejects malformed backups without changing any stored records or photos',async()=>{
  await baseline(); const before=await comparableSnapshot();
  const corruptions=[
    b=>b.app='another-app', b=>b.version=99,
    b=>delete b.records.clays, b=>b.records.pieces={},
    b=>b.records.pieces[0].id='" onclick="bad',
    b=>b.records.materials.push({...b.records.materials[0]}),
    b=>b.records.materials[0].recipe='invalid',
    b=>b.records.inspo[0].tags='form',
    b=>b.records.pieces[0].photos='photo-1',
    b=>b.records.pieces[0].pins[0].x=2,
    b=>b.records.pieces[0].pins[0].photoId='missing',
    b=>b.records.pieces[0].pins[0].layers=[null],
    b=>b.images[0].data='not base64!',
    b=>b.images[0].data=Buffer.from('not a JPEG').toString('base64'),
    b=>b.images[0].data=jpeg.subarray(0,-2).toString('base64'),
    b=>b.images[0].w=-1,
    b=>b.images.push({...b.images[0]}),
    b=>b.images=[]
  ];
  for(const corrupt of corruptions){
    const input=backup(); corrupt(input);
    assert.throws(()=>storage.prepareBackup(input),{name:'BackupValidationError'});
    assert.deepEqual(await comparableSnapshot(),before);
  }
});
test('a storage abort during restore rolls back overwritten records and every new record',async()=>{
  await baseline(); const before=await comparableSnapshot();
  await assert.rejects(storage.restore(abortAfterWrite('images'),storage.prepareBackup(backup())),{name:'AbortError'});
  assert.deepEqual(await comparableSnapshot(),before);
});
test('a synchronous write error also aborts previously queued writes',async()=>{
  await baseline(); const before=await comparableSnapshot();
  const prepared=storage.prepareBackup(backup());
  prepared.images.push({blob:new Blob([jpeg])});
  await assert.rejects(storage.restore(db,prepared),{name:'DataError'});
  assert.deepEqual(await comparableSnapshot(),before);
});
test('ordinary saves do not report success when the transaction aborts after request success',async()=>{
  await baseline();
  await assert.rejects(storage.put(abortAfterWrite('materials'),'materials',{id:'unrelated',name:'Should not save'}),{name:'AbortError'});
  assert.equal((await storage.snapshot(db)).materials[0].name,'Keep me');
});
test('deleting a piece deletes its photos but retains photos still used by other records',async()=>{
  await storage.restore(db,storage.prepareBackup(backup()));
  await storage.put(db,'images',{id:'piece-only',blob:new Blob([jpeg]),w:2,h:2});
  const piece=(await storage.snapshot(db)).pieces[0]; piece.photos.push('piece-only');
  await storage.put(db,'pieces',piece);
  const deleted=await storage.changeRecords(db,[{store:'pieces',id:'piece-1'}]);
  assert.deepEqual(deleted,['piece-only']);
  const result=await storage.snapshot(db);
  assert.equal(result.pieces.length,0);
  assert.deepEqual(result.images.map(im=>im.id),['photo-1']);
});
test('a bulk deletion removes a shared photo only when its last reference is deleted',async()=>{
  await storage.restore(db,storage.prepareBackup(backup()));
  await storage.put(db,'images',{id:'draft-photo',w:2,h:2,blob:new Blob([jpeg])});
  const removed=await storage.changeRecords(db,[{store:'pieces',id:'piece-1'},{store:'inspo',id:'inspo-1'}]);
  assert.deepEqual(removed,['photo-1']);
  assert.deepEqual((await storage.snapshot(db)).images.map(im=>im.id),['draft-photo']);
});
test('replacing a material photo cleans up its former photo',async()=>{
  await storage.put(db,'materials',{id:'glaze',name:'Glaze',imageId:'old'});
  for(const id of ['old','new']) await storage.put(db,'images',{id,w:2,h:2,blob:new Blob([jpeg])});
  await storage.changeRecords(db,[{store:'materials',id:'glaze',record:{id:'glaze',name:'Glaze',imageId:'new'}}]);
  const result=await storage.snapshot(db);
  assert.deepEqual(result.images.map(im=>im.id),['new']);
  assert.equal(result.materials[0].imageId,'new');
});
test('removing a photo and its marks keeps shared images intact',async()=>{
  await storage.restore(db,storage.prepareBackup(backup()));
  const piece=(await storage.snapshot(db)).pieces[0];
  await storage.changeRecords(db,[{store:'pieces',id:piece.id,record:{...piece,photos:[],pins:[]}}]);
  const result=await storage.snapshot(db);
  assert.equal(result.pieces[0].pins.length,0);
  assert.equal(result.images.length,1);
});
test('record and photo cleanup roll back together when a later edit fails',async()=>{
  await storage.restore(db,storage.prepareBackup(backup())); const before=await comparableSnapshot();
  await assert.rejects(storage.changeRecords(db,[{store:'pieces',id:'piece-1'},{store:'no-such-store',id:'bad'}]));
  assert.deepEqual(await comparableSnapshot(),before);
});
test('erase clears all stores in one transaction',async()=>{
  await storage.restore(db,storage.prepareBackup(backup()));
  await storage.clear(db);
  const result=await storage.snapshot(db);
  storage.STORES.forEach(s=>assert.deepEqual(result[s],[]));
});
test('a failed erase leaves every store unchanged',async()=>{
  await storage.restore(db,storage.prepareBackup(backup())); const before=await comparableSnapshot();
  const failing={transaction(...args){
    const tx=db.transaction(...args), objectStore=tx.objectStore.bind(tx);
    tx.objectStore=s=>{
      const store=objectStore(s);
      if(s==='images') store.clear=()=>{ throw new Error('Forced storage failure'); };
      return store;
    };
    return tx;
  }};
  await assert.rejects(storage.clear(failing));
  assert.deepEqual(await comparableSnapshot(),before);
});
