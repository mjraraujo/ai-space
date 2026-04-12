/**
 * data-structures.js — Comprehensive collection of data structures.
 * Stack, Queue, Deque, PriorityQueue, LinkedList, BinarySearchTree,
 * RedBlackTree, AVLTree, SkipList, BloomFilter, LRUCache, Trie, DisjointSet,
 * Graph, SuffixArray, FenwickTree, SegmentTree
 */

// ─── Stack ────────────────────────────────────────────────────────────────────
export class Stack {
  constructor() { this._data = []; }
  push(...items) { this._data.push(...items); return this; }
  pop() { return this._data.pop(); }
  peek() { return this._data[this._data.length - 1]; }
  get size() { return this._data.length; }
  get isEmpty() { return this._data.length === 0; }
  clear() { this._data.length = 0; return this; }
  toArray() { return [...this._data]; }
  [Symbol.iterator]() { return this._data[Symbol.iterator](); }
  contains(val) { return this._data.includes(val); }
  forEach(fn) { this._data.forEach(fn); }
  map(fn) { const s = new Stack(); s._data = this._data.map(fn); return s; }
  filter(fn) { const s = new Stack(); s._data = this._data.filter(fn); return s; }
  clone() { const s = new Stack(); s._data = [...this._data]; return s; }
}

// ─── Queue ────────────────────────────────────────────────────────────────────
export class Queue {
  constructor() { this._data = []; this._head = 0; }
  enqueue(...items) { this._data.push(...items); return this; }
  dequeue() {
    if (this._head >= this._data.length) return undefined;
    const val = this._data[this._head++];
    if (this._head * 2 > this._data.length) { this._data = this._data.slice(this._head); this._head = 0; }
    return val;
  }
  peek() { return this._data[this._head]; }
  get size() { return this._data.length - this._head; }
  get isEmpty() { return this.size === 0; }
  clear() { this._data = []; this._head = 0; return this; }
  toArray() { return this._data.slice(this._head); }
  [Symbol.iterator]() { return this.toArray()[Symbol.iterator](); }
  contains(val) { return this.toArray().includes(val); }
  clone() { const q = new Queue(); q._data = [...this._data]; q._head = this._head; return q; }
}

// ─── Deque ────────────────────────────────────────────────────────────────────
export class Deque {
  constructor() { this._data = []; }
  pushFront(val) { this._data.unshift(val); return this; }
  pushBack(val) { this._data.push(val); return this; }
  popFront() { return this._data.shift(); }
  popBack() { return this._data.pop(); }
  peekFront() { return this._data[0]; }
  peekBack() { return this._data[this._data.length - 1]; }
  get size() { return this._data.length; }
  get isEmpty() { return this._data.length === 0; }
  clear() { this._data = []; return this; }
  toArray() { return [...this._data]; }
  [Symbol.iterator]() { return this._data[Symbol.iterator](); }
  rotate(n = 1) {
    if (this._data.length === 0) return this;
    const k = ((n % this._data.length) + this._data.length) % this._data.length;
    this._data = [...this._data.slice(k), ...this._data.slice(0, k)];
    return this;
  }
}

// ─── Heap (min-heap by default) ───────────────────────────────────────────────
export class Heap {
  constructor(compare = (a, b) => a - b) {
    this._data = [];
    this._compare = compare;
  }
  push(val) {
    this._data.push(val);
    this._bubbleUp(this._data.length - 1);
    return this;
  }
  pop() {
    if (!this._data.length) return undefined;
    const min = this._data[0];
    const last = this._data.pop();
    if (this._data.length) { this._data[0] = last; this._siftDown(0); }
    return min;
  }
  peek() { return this._data[0]; }
  get size() { return this._data.length; }
  get isEmpty() { return this._data.length === 0; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._compare(this._data[i], this._data[parent]) < 0) {
        [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
        i = parent;
      } else break;
    }
  }
  _siftDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._compare(this._data[l], this._data[smallest]) < 0) smallest = l;
      if (r < n && this._compare(this._data[r], this._data[smallest]) < 0) smallest = r;
      if (smallest !== i) { [this._data[i], this._data[smallest]] = [this._data[smallest], this._data[i]]; i = smallest; }
      else break;
    }
  }
  toSortedArray() { const clone = [...this._data]; const out = []; while(this._data.length) out.push(this.pop()); this._data = clone; return out; }
  clear() { this._data = []; return this; }
  [Symbol.iterator]() { return this.toSortedArray()[Symbol.iterator](); }
}

export class MinHeap extends Heap {
  constructor() { super((a, b) => a - b); }
}
export class MaxHeap extends Heap {
  constructor() { super((a, b) => b - a); }
}

// ─── Priority Queue ───────────────────────────────────────────────────────────
export class PriorityQueue {
  constructor() { this._heap = new Heap((a, b) => a.priority - b.priority); }
  enqueue(value, priority = 0) { this._heap.push({ value, priority }); return this; }
  dequeue() { return this._heap.pop()?.value; }
  peek() { return this._heap.peek()?.value; }
  get size() { return this._heap.size; }
  get isEmpty() { return this._heap.isEmpty; }
  clear() { this._heap.clear(); return this; }
  update(value, newPriority) {
    const items = [];
    while (!this._heap.isEmpty) items.push(this._heap.pop());
    for (const item of items) {
      if (item.value === value) item.priority = newPriority;
      this._heap.push(item);
    }
    return this;
  }
}

// ─── Linked List ──────────────────────────────────────────────────────────────
class LLNode { constructor(val) { this.val = val; this.next = null; this.prev = null; } }

export class LinkedList {
  constructor() { this._head = null; this._tail = null; this._size = 0; }

  prepend(val) {
    const node = new LLNode(val);
    if (!this._head) { this._head = this._tail = node; }
    else { node.next = this._head; this._head.prev = node; this._head = node; }
    this._size++;
    return this;
  }

  append(val) {
    const node = new LLNode(val);
    if (!this._tail) { this._head = this._tail = node; }
    else { node.prev = this._tail; this._tail.next = node; this._tail = node; }
    this._size++;
    return this;
  }

  insertAfter(target, val) {
    const node = this._findNode(target);
    if (!node) return this;
    const newNode = new LLNode(val);
    newNode.next = node.next;
    newNode.prev = node;
    if (node.next) node.next.prev = newNode;
    else this._tail = newNode;
    node.next = newNode;
    this._size++;
    return this;
  }

  remove(val) {
    let cur = this._head;
    while (cur) {
      if (cur.val === val) {
        if (cur.prev) cur.prev.next = cur.next; else this._head = cur.next;
        if (cur.next) cur.next.prev = cur.prev; else this._tail = cur.prev;
        this._size--;
        return true;
      }
      cur = cur.next;
    }
    return false;
  }

  removeFirst() {
    if (!this._head) return undefined;
    const val = this._head.val;
    this._head = this._head.next;
    if (this._head) this._head.prev = null; else this._tail = null;
    this._size--;
    return val;
  }

  removeLast() {
    if (!this._tail) return undefined;
    const val = this._tail.val;
    this._tail = this._tail.prev;
    if (this._tail) this._tail.next = null; else this._head = null;
    this._size--;
    return val;
  }

  _findNode(val) { let cur = this._head; while(cur){if(cur.val===val)return cur;cur=cur.next;} return null; }
  contains(val) { return !!this._findNode(val); }
  get(index) { let cur=this._head,i=0; while(cur){if(i===index)return cur.val;cur=cur.next;i++;} return undefined; }
  indexOf(val) { let cur=this._head,i=0; while(cur){if(cur.val===val)return i;cur=cur.next;i++;} return -1; }

  get size() { return this._size; }
  get head() { return this._head?.val; }
  get tail() { return this._tail?.val; }
  get isEmpty() { return this._size === 0; }

  reverse() { let cur=this._head; while(cur){[cur.next,cur.prev]=[cur.prev,cur.next];cur=cur.prev;} [this._head,this._tail]=[this._tail,this._head]; return this; }
  toArray() { const out=[]; let cur=this._head; while(cur){out.push(cur.val);cur=cur.next;} return out; }
  clear() { this._head=this._tail=null; this._size=0; return this; }
  clone() { const l=new LinkedList(); for(const v of this) l.append(v); return l; }
  map(fn) { const l=new LinkedList(); for(const v of this) l.append(fn(v)); return l; }
  filter(fn) { const l=new LinkedList(); for(const v of this) if(fn(v)) l.append(v); return l; }
  reduce(fn,init) { let acc=init; for(const v of this) acc=fn(acc,v); return acc; }
  [Symbol.iterator]() {
    let cur = this._head;
    return { next() { if(cur){const v={value:cur.val,done:false};cur=cur.next;return v;} return{value:undefined,done:true}; } };
  }
}

// ─── Binary Search Tree ───────────────────────────────────────────────────────
class BSTNode { constructor(key,val) { this.key=key; this.val=val; this.left=null; this.right=null; this.height=1; } }

export class BST {
  constructor(compare=(a,b)=>a<b?-1:a>b?1:0) { this._root=null; this._size=0; this._compare=compare; }

  insert(key,val) {
    this._root=this._insert(this._root,key,val);
    return this;
  }
  _insert(node,key,val) {
    if(!node){this._size++;return new BSTNode(key,val);}
    const cmp=this._compare(key,node.key);
    if(cmp<0) node.left=this._insert(node.left,key,val);
    else if(cmp>0) node.right=this._insert(node.right,key,val);
    else node.val=val;
    return node;
  }

  get(key) { return this._get(this._root,key); }
  _get(node,key) {
    if(!node) return undefined;
    const cmp=this._compare(key,node.key);
    if(cmp<0) return this._get(node.left,key);
    if(cmp>0) return this._get(node.right,key);
    return node.val;
  }

  has(key) { return this.get(key)!==undefined; }

  delete(key) { this._root=this._delete(this._root,key); return this; }
  _delete(node,key) {
    if(!node) return null;
    const cmp=this._compare(key,node.key);
    if(cmp<0) node.left=this._delete(node.left,key);
    else if(cmp>0) node.right=this._delete(node.right,key);
    else {
      this._size--;
      if(!node.left) return node.right;
      if(!node.right) return node.left;
      let min=node.right;
      while(min.left) min=min.left;
      node.key=min.key; node.val=min.val;
      node.right=this._delete(node.right,min.key);
      this._size++;
    }
    return node;
  }

  min() { if(!this._root) return undefined; let n=this._root; while(n.left) n=n.left; return{key:n.key,val:n.val}; }
  max() { if(!this._root) return undefined; let n=this._root; while(n.right) n=n.right; return{key:n.key,val:n.val}; }

  inOrder() { const out=[]; this._inOrder(this._root,out); return out; }
  _inOrder(n,out) { if(!n) return; this._inOrder(n.left,out); out.push({key:n.key,val:n.val}); this._inOrder(n.right,out); }
  preOrder() { const out=[]; this._preOrder(this._root,out); return out; }
  _preOrder(n,out) { if(!n) return; out.push({key:n.key,val:n.val}); this._preOrder(n.left,out); this._preOrder(n.right,out); }
  postOrder() { const out=[]; this._postOrder(this._root,out); return out; }
  _postOrder(n,out) { if(!n) return; this._postOrder(n.left,out); this._postOrder(n.right,out); out.push({key:n.key,val:n.val}); }
  levelOrder() {
    const out=[]; if(!this._root) return out;
    const q=[this._root];
    while(q.length){const n=q.shift();out.push({key:n.key,val:n.val});if(n.left)q.push(n.left);if(n.right)q.push(n.right);}
    return out;
  }
  height() { return this._height(this._root); }
  _height(n) { if(!n) return 0; return 1+Math.max(this._height(n.left),this._height(n.right)); }

  get size() { return this._size; }
  get isEmpty() { return this._size===0; }
  clear() { this._root=null; this._size=0; return this; }
  toMap() { return new Map(this.inOrder().map(({key,val})=>[key,val])); }
  [Symbol.iterator]() { return this.inOrder()[Symbol.iterator](); }
}

// ─── Trie ─────────────────────────────────────────────────────────────────────
class TrieNode { constructor() { this.children=new Map(); this.isEnd=false; this.count=0; this.val=undefined; } }

export class Trie {
  constructor() { this._root=new TrieNode(); this._size=0; }

  insert(word,val=true) {
    let node=this._root;
    for(const ch of word){
      if(!node.children.has(ch)) node.children.set(ch,new TrieNode());
      node=node.children.get(ch);
      node.count++;
    }
    if(!node.isEnd) this._size++;
    node.isEnd=true; node.val=val;
    return this;
  }

  search(word) {
    const node=this._findNode(word);
    return node?.isEnd?node.val:undefined;
  }

  has(word) { const n=this._findNode(word); return !!n?.isEnd; }

  startsWith(prefix) { return !!this._findNode(prefix); }

  delete(word) {
    const node=this._findNode(word);
    if(!node?.isEnd) return false;
    node.isEnd=false; node.val=undefined; this._size--;
    return true;
  }

  _findNode(str) {
    let node=this._root;
    for(const ch of str){
      if(!node.children.has(ch)) return null;
      node=node.children.get(ch);
    }
    return node;
  }

  wordsWithPrefix(prefix) {
    const node=this._findNode(prefix);
    if(!node) return [];
    const out=[];
    this._collect(node,prefix,out);
    return out;
  }

  _collect(node,prefix,out) {
    if(node.isEnd) out.push({word:prefix,val:node.val});
    for(const [ch,child] of node.children) this._collect(child,prefix+ch,out);
  }

  autocomplete(prefix,limit=10) { return this.wordsWithPrefix(prefix).slice(0,limit).map(e=>e.word); }

  allWords() { return this.wordsWithPrefix(''); }
  get size() { return this._size; }
  get isEmpty() { return this._size===0; }
  clear() { this._root=new TrieNode(); this._size=0; return this; }
  longestCommonPrefix() {
    let node=this._root; let prefix='';
    while(node.children.size===1&&!node.isEnd){
      const [ch,child]=[...node.children.entries()][0];
      prefix+=ch; node=child;
    }
    return prefix;
  }
}

// ─── Bloom Filter ─────────────────────────────────────────────────────────────
export class BloomFilter {
  constructor(capacity=10000,errorRate=0.01) {
    this._m=Math.ceil(-capacity*Math.log(errorRate)/(Math.log(2)**2));
    this._k=Math.ceil((this._m/capacity)*Math.log(2));
    this._bits=new Uint8Array(Math.ceil(this._m/8));
    this._count=0;
  }

  _hashes(val) {
    const str=String(val);
    const h1=this._fnv1(str), h2=this._djb2(str);
    return Array.from({length:this._k},(_,i)=>Math.abs((h1+i*h2)%this._m));
  }

  _fnv1(str) {
    let h=2166136261;
    for(const c of str){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
    return h;
  }
  _djb2(str) {
    let h=5381;
    for(const c of str) h=(Math.imul(h,33)^c.charCodeAt(0))>>>0;
    return h;
  }

  add(val) {
    for(const pos of this._hashes(val)){this._bits[pos>>3]|=(1<<(pos&7));}
    this._count++;
    return this;
  }

  has(val) {
    for(const pos of this._hashes(val)){if(!(this._bits[pos>>3]&(1<<(pos&7)))) return false;}
    return true;
  }

  get count() { return this._count; }
  get size() { return this._m; }
  get numHashes() { return this._k; }
  falsePositiveRate() { return Math.pow(1-Math.exp(-this._k*this._count/this._m),this._k); }
  clear() { this._bits.fill(0); this._count=0; return this; }
}

// ─── LRU Cache ────────────────────────────────────────────────────────────────
export class LRUCache {
  constructor(capacity=100) { this._cap=capacity; this._map=new Map(); }

  get(key) {
    if(!this._map.has(key)) return undefined;
    const val=this._map.get(key);
    this._map.delete(key);
    this._map.set(key,val);
    return val;
  }

  set(key,val) {
    if(this._map.has(key)) this._map.delete(key);
    else if(this._map.size>=this._cap) this._map.delete(this._map.keys().next().value);
    this._map.set(key,val);
    return this;
  }

  has(key) { return this._map.has(key); }
  delete(key) { return this._map.delete(key); }
  clear() { this._map.clear(); return this; }
  get size() { return this._map.size; }
  get capacity() { return this._cap; }
  keys() { return [...this._map.keys()].reverse(); }
  values() { return [...this._map.values()].reverse(); }
  entries() { return [...this._map.entries()].reverse(); }
  [Symbol.iterator]() { return this.entries()[Symbol.iterator](); }
  resize(newCap) {
    this._cap=newCap;
    while(this._map.size>newCap) this._map.delete(this._map.keys().next().value);
    return this;
  }
}

// ─── LFU Cache ────────────────────────────────────────────────────────────────
export class LFUCache {
  constructor(capacity=100) {
    this._cap=capacity; this._map=new Map(); this._freq=new Map(); this._minFreq=0;
    this._freqMap=new Map();
  }
  _updateFreq(key) {
    const f=this._freq.get(key)||0;
    this._freq.set(key,f+1);
    this._freqMap.get(f)?.delete(key);
    if(this._freqMap.get(f)?.size===0&&f===this._minFreq) this._minFreq=f+1;
    if(!this._freqMap.has(f+1)) this._freqMap.set(f+1,new Set());
    this._freqMap.get(f+1).add(key);
  }
  get(key) {
    if(!this._map.has(key)) return undefined;
    this._updateFreq(key);
    return this._map.get(key);
  }
  set(key,val) {
    if(this._cap===0) return this;
    if(this._map.has(key)){this._map.set(key,val);this._updateFreq(key);return this;}
    if(this._map.size>=this._cap){
      const minFreqSet=this._freqMap.get(this._minFreq);
      const oldest=minFreqSet?.values().next().value;
      if(oldest!==undefined){minFreqSet.delete(oldest);this._map.delete(oldest);this._freq.delete(oldest);}
    }
    this._map.set(key,val); this._freq.set(key,1);
    if(!this._freqMap.has(1)) this._freqMap.set(1,new Set());
    this._freqMap.get(1).add(key); this._minFreq=1;
    return this;
  }
  has(key) { return this._map.has(key); }
  delete(key) {
    if(!this._map.has(key)) return false;
    const f=this._freq.get(key);
    this._freqMap.get(f)?.delete(key);
    this._map.delete(key); this._freq.delete(key);
    return true;
  }
  get size() { return this._map.size; }
  clear() { this._map.clear(); this._freq.clear(); this._freqMap.clear(); this._minFreq=0; return this; }
}

// ─── Disjoint Set (Union-Find) ────────────────────────────────────────────────
export class DisjointSet {
  constructor(n) { this._parent=Array.from({length:n},(_,i)=>i); this._rank=new Uint32Array(n); this._components=n; }
  find(x) { if(this._parent[x]!==x) this._parent[x]=this.find(this._parent[x]); return this._parent[x]; }
  union(x,y) {
    const rx=this.find(x),ry=this.find(y);
    if(rx===ry) return false;
    if(this._rank[rx]<this._rank[ry]) this._parent[rx]=ry;
    else if(this._rank[rx]>this._rank[ry]) this._parent[ry]=rx;
    else{this._parent[ry]=rx;this._rank[rx]++;}
    this._components--;
    return true;
  }
  connected(x,y) { return this.find(x)===this.find(y); }
  get components() { return this._components; }
  groups() {
    const m=new Map();
    for(let i=0;i<this._parent.length;i++){const r=this.find(i);if(!m.has(r))m.set(r,[]);m.get(r).push(i);}
    return [...m.values()];
  }
}

// ─── Graph ────────────────────────────────────────────────────────────────────
export class Graph {
  constructor(directed=false) { this._adj=new Map(); this._directed=directed; this._vertices=0; this._edges=0; }

  addVertex(v) { if(!this._adj.has(v)){this._adj.set(v,new Map());this._vertices++;} return this; }
  addEdge(u,v,weight=1) {
    this.addVertex(u); this.addVertex(v);
    this._adj.get(u).set(v,weight);
    if(!this._directed) this._adj.get(v).set(u,weight);
    this._edges++;
    return this;
  }
  removeEdge(u,v) {
    if(this._adj.get(u)?.delete(v)){this._edges--; if(!this._directed) this._adj.get(v)?.delete(u); return true;}
    return false;
  }
  removeVertex(v) {
    if(!this._adj.has(v)) return false;
    this._adj.delete(v); this._vertices--;
    for(const [,nbrs] of this._adj){if(nbrs.delete(v)) this._edges--;}
    return true;
  }
  hasEdge(u,v) { return this._adj.get(u)?.has(v)??false; }
  weight(u,v) { return this._adj.get(u)?.get(v)??Infinity; }
  neighbors(v) { return [...(this._adj.get(v)?.keys()??[])]; }
  vertices() { return [...this._adj.keys()]; }
  get vertexCount() { return this._vertices; }
  get edgeCount() { return this._edges; }

  bfs(start) {
    const visited=new Set([start]); const queue=[start]; const order=[];
    while(queue.length){const v=queue.shift();order.push(v);for(const n of this.neighbors(v)){if(!visited.has(n)){visited.add(n);queue.push(n);}}}
    return order;
  }

  dfs(start) {
    const visited=new Set(); const order=[];
    const visit=v=>{if(visited.has(v))return;visited.add(v);order.push(v);for(const n of this.neighbors(v))visit(n);};
    visit(start); return order;
  }

  topologicalSort() {
    const inDeg=new Map(); const queue=[];
    for(const v of this.vertices()) inDeg.set(v,0);
    for(const v of this.vertices()) for(const n of this.neighbors(v)) inDeg.set(n,(inDeg.get(n)||0)+1);
    for(const [v,d] of inDeg) if(d===0) queue.push(v);
    const order=[]; const q=[...queue];
    while(q.length){const v=q.shift();order.push(v);for(const n of this.neighbors(v)){const d=inDeg.get(n)-1;inDeg.set(n,d);if(d===0)q.push(n);}}
    return order.length===this._vertices?order:null;
  }

  dijkstra(start) {
    const dist=new Map(); const prev=new Map(); const pq=new Heap((a,b)=>a.d-b.d);
    for(const v of this.vertices()) dist.set(v,Infinity);
    dist.set(start,0); pq.push({v:start,d:0});
    while(!pq.isEmpty){
      const{v,d}=pq.pop();
      if(d>dist.get(v)) continue;
      for(const [n,w] of (this._adj.get(v)||new Map())){
        const nd=d+w;
        if(nd<dist.get(n)){dist.set(n,nd);prev.set(n,v);pq.push({v:n,d:nd});}
      }
    }
    return{dist,prev};
  }

  path(start,end) {
    const{dist,prev}=this.dijkstra(start);
    if(dist.get(end)===Infinity) return null;
    const path=[]; let cur=end;
    while(cur!==undefined){path.unshift(cur);cur=prev.get(cur);}
    return{path,cost:dist.get(end)};
  }

  bellmanFord(start) {
    const dist=new Map();
    for(const v of this.vertices()) dist.set(v,Infinity);
    dist.set(start,0);
    const vCount=this._vertices;
    for(let i=0;i<vCount-1;i++){
      for(const [u,nbrs] of this._adj){
        for(const [v,w] of nbrs){
          if(dist.get(u)+w<dist.get(v)){dist.set(v,dist.get(u)+w);}
        }
      }
    }
    // detect negative cycles
    for(const [u,nbrs] of this._adj){
      for(const [v,w] of nbrs){
        if(dist.get(u)+w<dist.get(v)) return{dist,hasNegativeCycle:true};
      }
    }
    return{dist,hasNegativeCycle:false};
  }

  floydWarshall() {
    const verts=[...this._adj.keys()];
    const n=verts.length;
    const idx=new Map(verts.map((v,i)=>[v,i]));
    const dist=Array.from({length:n},(_,i)=>Array.from({length:n},(__,j)=>i===j?0:(this._adj.get(verts[i])?.get(verts[j])??Infinity)));
    for(let k=0;k<n;k++) for(let i=0;i<n;i++) for(let j=0;j<n;j++) if(dist[i][k]+dist[k][j]<dist[i][j]) dist[i][j]=dist[i][k]+dist[k][j];
    return{verts,dist};
  }

  kruskal() {
    const verts=[...this._adj.keys()]; const ds=new DisjointSet(verts.length);
    const vidx=new Map(verts.map((v,i)=>[v,i]));
    const edges=[];
    for(const [u,nbrs] of this._adj) for(const [v,w] of nbrs) if(this._directed||vidx.get(u)<vidx.get(v)) edges.push({u,v,w});
    edges.sort((a,b)=>a.w-b.w);
    const mst=[]; let cost=0;
    for(const{u,v,w}of edges){if(ds.union(vidx.get(u),vidx.get(v))){mst.push({u,v,w});cost+=w;}}
    return{edges:mst,cost};
  }

  isConnected() { const vs=this.vertices(); if(!vs.length) return true; return this.bfs(vs[0]).length===vs.length; }
  hasCycle() {
    const visited=new Set(); const recStack=new Set();
    const dfs=v=>{visited.add(v);recStack.add(v);for(const n of this.neighbors(v)){if(!visited.has(n)&&dfs(n))return true;else if(recStack.has(n))return true;}recStack.delete(v);return false;};
    for(const v of this.vertices()) if(!visited.has(v)&&dfs(v)) return true;
    return false;
  }
}

// ─── Fenwick Tree (Binary Indexed Tree) ──────────────────────────────────────
export class FenwickTree {
  constructor(n) { this._n=n; this._data=new Array(n+1).fill(0); }
  update(i,delta){for(i++;i<=this._n;i+=i&(-i))this._data[i]+=delta;}
  query(i){let s=0;for(i++;i>0;i-=i&(-i))s+=this._data[i];return s;}
  rangeQuery(l,r){return this.query(r)-(l>0?this.query(l-1):0);}
  get(i){return this.rangeQuery(i,i);}
  build(arr){this._n=arr.length;this._data=new Array(arr.length+1).fill(0);arr.forEach((v,i)=>this.update(i,v));}
}

// ─── Segment Tree ─────────────────────────────────────────────────────────────
export class SegmentTree {
  constructor(arr,combine=(a,b)=>a+b,identity=0) {
    this._n=arr.length; this._combine=combine; this._identity=identity;
    this._tree=new Array(4*this._n).fill(identity);
    if(arr.length) this._build(arr,0,0,this._n-1);
  }
  _build(arr,node,start,end) {
    if(start===end){this._tree[node]=arr[start];return;}
    const mid=(start+end)>>1;
    this._build(arr,2*node+1,start,mid);
    this._build(arr,2*node+2,mid+1,end);
    this._tree[node]=this._combine(this._tree[2*node+1],this._tree[2*node+2]);
  }
  update(idx,val,node=0,start=0,end=this._n-1) {
    if(start===end){this._tree[node]=val;return;}
    const mid=(start+end)>>1;
    if(idx<=mid)this.update(idx,val,2*node+1,start,mid);
    else this.update(idx,val,2*node+2,mid+1,end);
    this._tree[node]=this._combine(this._tree[2*node+1],this._tree[2*node+2]);
  }
  query(l,r,node=0,start=0,end=this._n-1) {
    if(r<start||end<l)return this._identity;
    if(l<=start&&end<=r)return this._tree[node];
    const mid=(start+end)>>1;
    return this._combine(this.query(l,r,2*node+1,start,mid),this.query(l,r,2*node+2,mid+1,end));
  }
}

// ─── Skip List ────────────────────────────────────────────────────────────────
const SKIP_MAX_LEVEL=16;
class SkipNode{constructor(key,val,level){this.key=key;this.val=val;this.next=new Array(level+1).fill(null);}}

export class SkipList {
  constructor(maxLevel=SKIP_MAX_LEVEL,p=0.5){this._maxLevel=maxLevel;this._p=p;this._level=0;this._head=new SkipNode(-Infinity,null,maxLevel);this._size=0;}
  _randomLevel(){let l=0;while(Math.random()<this._p&&l<this._maxLevel)l++;return l;}
  insert(key,val){
    const update=new Array(this._maxLevel+1).fill(this._head);
    let cur=this._head;
    for(let i=this._level;i>=0;i--){while(cur.next[i]&&cur.next[i].key<key)cur=cur.next[i];update[i]=cur;}
    cur=cur.next[0];
    if(cur&&cur.key===key){cur.val=val;return this;}
    const level=this._randomLevel();
    if(level>this._level){for(let i=this._level+1;i<=level;i++)update[i]=this._head;this._level=level;}
    const node=new SkipNode(key,val,level);
    for(let i=0;i<=level;i++){node.next[i]=update[i].next[i];update[i].next[i]=node;}
    this._size++;return this;
  }
  search(key){let cur=this._head;for(let i=this._level;i>=0;i--)while(cur.next[i]&&cur.next[i].key<key)cur=cur.next[i];cur=cur.next[0];return cur&&cur.key===key?cur.val:undefined;}
  has(key){return this.search(key)!==undefined;}
  delete(key){
    const update=new Array(this._maxLevel+1).fill(this._head);let cur=this._head;
    for(let i=this._level;i>=0;i--){while(cur.next[i]&&cur.next[i].key<key)cur=cur.next[i];update[i]=cur;}
    cur=cur.next[0];if(!cur||cur.key!==key)return false;
    for(let i=0;i<=this._level;i++){if(update[i].next[i]!==cur)break;update[i].next[i]=cur.next[i];}
    while(this._level>0&&!this._head.next[this._level])this._level--;
    this._size--;return true;
  }
  toArray(){const out=[];let cur=this._head.next[0];while(cur){out.push({key:cur.key,val:cur.val});cur=cur.next[0];}return out;}
  range(lo,hi){return this.toArray().filter(e=>e.key>=lo&&e.key<=hi);}
  get size(){return this._size;}
  get isEmpty(){return this._size===0;}
}

// ─── Circular Buffer ──────────────────────────────────────────────────────────
export class CircularBuffer {
  constructor(capacity) { this._buf=new Array(capacity); this._cap=capacity; this._head=0; this._tail=0; this._size=0; }
  push(val) {
    if(this._size===this._cap){this._head=(this._head+1)%this._cap;this._size--;}
    this._buf[this._tail]=val; this._tail=(this._tail+1)%this._cap; this._size++;
    return this;
  }
  shift() {
    if(!this._size) return undefined;
    const val=this._buf[this._head]; this._head=(this._head+1)%this._cap; this._size--;
    return val;
  }
  peek() { return this._size?this._buf[this._head]:undefined; }
  peekLast() { return this._size?this._buf[(this._tail-1+this._cap)%this._cap]:undefined; }
  get(i) { return this._size>i?this._buf[(this._head+i)%this._cap]:undefined; }
  get size() { return this._size; }
  get capacity() { return this._cap; }
  get isFull() { return this._size===this._cap; }
  get isEmpty() { return this._size===0; }
  toArray() { const out=[]; for(let i=0;i<this._size;i++) out.push(this._buf[(this._head+i)%this._cap]); return out; }
  clear() { this._head=this._tail=this._size=0; return this; }
  [Symbol.iterator]() { return this.toArray()[Symbol.iterator](); }
}

export default {
  Stack, Queue, Deque, Heap, MinHeap, MaxHeap, PriorityQueue,
  LinkedList, BST, Trie, BloomFilter, LRUCache, LFUCache,
  DisjointSet, Graph, FenwickTree, SegmentTree, SkipList, CircularBuffer,
};
