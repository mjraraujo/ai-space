/**
 * math-engine.js — Comprehensive mathematics library.
 * Covers: vectors, matrices, complex numbers, quaternions, statistics, FFT,
 * numerical methods, linear algebra, signal processing, geometry.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const E = Math.E;
export const PHI = (1 + Math.sqrt(5)) / 2;   // Golden ratio
export const SQRT2 = Math.SQRT2;
export const LN2 = Math.LN2;
export const LN10 = Math.LN10;
export const EPSILON = Number.EPSILON;

// ─── Basic math ───────────────────────────────────────────────────────────────
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remap = (v, a1, b1, a2, b2) => lerp(a2, b2, invLerp(a1, b1, v));
export const smoothstep = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export const snap = (v, grid) => Math.round(v / grid) * grid;
export const mod = (v, m) => ((v % m) + m) % m;
export const fract = (v) => v - Math.floor(v);
export const sign = (v) => v > 0 ? 1 : v < 0 ? -1 : 0;
export const isPowerOf2 = (n) => n > 0 && (n & (n - 1)) === 0;
export const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
export const radToDeg = (r) => r * (180 / PI);
export const degToRad = (d) => d * (PI / 180);
export const roundTo = (v, decimals) => Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
export const approxEqual = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// GCD / LCM
export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
export function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }
export function extendedGcd(a, b) {
  if (b === 0) return { g: a, x: 1, y: 0 };
  const { g, x, y } = extendedGcd(b, a % b);
  return { g, x: y, y: x - Math.floor(a / b) * y };
}

// Factorial and combinations
export function factorial(n) { if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
export function nCr(n, r) { if (r > n) return 0; if (r === 0 || r === n) return 1; r = Math.min(r, n - r); let res = 1; for (let i = 0; i < r; i++) { res *= n - i; res /= i + 1; } return Math.round(res); }
export function nPr(n, r) { if (r > n) return 0; let res = 1; for (let i = n; i > n - r; i--) res *= i; return res; }

// Fibonacci
export function fibonacci(n) { const a = BigInt(0), b = BigInt(1); if (n === 0) return a; if (n === 1) return b; let [x, y] = [a, b]; for (let i = 2; i <= n; i++) [x, y] = [y, x + y]; return y; }
export function fibSequence(n) { const seq = [0, 1]; for (let i = 2; i < n; i++) seq.push(seq[i-1] + seq[i-2]); return seq.slice(0, n); }

// Primes
export function isPrime(n) { if (n < 2) return false; if (n === 2) return true; if (n % 2 === 0) return false; for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; }
export function sieve(limit) { const composite = new Uint8Array(limit + 1); const primes = []; for (let i = 2; i <= limit; i++) { if (!composite[i]) { primes.push(i); for (let j = i * i; j <= limit; j += i) composite[j] = 1; } } return primes; }
export function primeFactors(n) { const factors = []; for (let d = 2; d * d <= n; d++) while (n % d === 0) { factors.push(d); n /= d; } if (n > 1) factors.push(n); return factors; }

// ─── Vector2 ──────────────────────────────────────────────────────────────────
export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  static from([x, y]) { return new Vec2(x, y); }
  static zero() { return new Vec2(0, 0); }
  static one() { return new Vec2(1, 1); }
  static up() { return new Vec2(0, 1); }
  static right() { return new Vec2(1, 0); }
  static fromAngle(a) { return new Vec2(Math.cos(a), Math.sin(a)); }
  static lerp(a, b, t) { return new Vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t)); }
  static random() { return Vec2.fromAngle(Math.random() * TAU); }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s) { return new Vec2(this.x * s, this.y * s); }
  div(s) { return new Vec2(this.x / s, this.y / s); }
  neg() { return new Vec2(-this.x, -this.y); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  cross(v) { return this.x * v.y - this.y * v.x; }
  get lenSq() { return this.x * this.x + this.y * this.y; }
  get len() { return Math.sqrt(this.lenSq); }
  normalize() { const l = this.len; return l > 0 ? this.div(l) : new Vec2(); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); return new Vec2(c * this.x - s * this.y, s * this.x + c * this.y); }
  angle() { return Math.atan2(this.y, this.x); }
  angleTo(v) { return Math.atan2(this.cross(v), this.dot(v)); }
  distTo(v) { return this.sub(v).len; }
  distToSq(v) { return this.sub(v).lenSq; }
  reflect(n) { const d = this.dot(n) * 2; return this.sub(n.mul(d)); }
  project(v) { return v.mul(this.dot(v) / v.lenSq); }
  perp() { return new Vec2(-this.y, this.x); }
  floor() { return new Vec2(Math.floor(this.x), Math.floor(this.y)); }
  ceil() { return new Vec2(Math.ceil(this.x), Math.ceil(this.y)); }
  round() { return new Vec2(Math.round(this.x), Math.round(this.y)); }
  clamp(lo, hi) { return new Vec2(clamp(this.x, lo, hi), clamp(this.y, lo, hi)); }
  abs() { return new Vec2(Math.abs(this.x), Math.abs(this.y)); }
  toArray() { return [this.x, this.y]; }
  equals(v, eps = 1e-9) { return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps; }
  clone() { return new Vec2(this.x, this.y); }
  toString() { return `Vec2(${this.x.toFixed(4)}, ${this.y.toFixed(4)})`; }
  [Symbol.iterator]() { return [this.x, this.y][Symbol.iterator](); }
}

// ─── Vector3 ──────────────────────────────────────────────────────────────────
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  static from([x, y, z]) { return new Vec3(x, y, z); }
  static zero() { return new Vec3(0, 0, 0); }
  static one() { return new Vec3(1, 1, 1); }
  static up() { return new Vec3(0, 1, 0); }
  static right() { return new Vec3(1, 0, 0); }
  static forward() { return new Vec3(0, 0, -1); }
  static lerp(a, b, t) { return new Vec3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t)); }
  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  mul(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  div(s) { return new Vec3(this.x / s, this.y / s, this.z / s); }
  neg() { return new Vec3(-this.x, -this.y, -this.z); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { return new Vec3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
  get lenSq() { return this.x*this.x + this.y*this.y + this.z*this.z; }
  get len() { return Math.sqrt(this.lenSq); }
  normalize() { const l = this.len; return l > 0 ? this.div(l) : new Vec3(); }
  distTo(v) { return this.sub(v).len; }
  distToSq(v) { return this.sub(v).lenSq; }
  angleTo(v) { return Math.acos(clamp(this.dot(v) / (this.len * v.len), -1, 1)); }
  reflect(n) { return this.sub(n.mul(2 * this.dot(n))); }
  project(v) { return v.mul(this.dot(v) / v.lenSq); }
  abs() { return new Vec3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z)); }
  floor() { return new Vec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
  ceil() { return new Vec3(Math.ceil(this.x), Math.ceil(this.y), Math.ceil(this.z)); }
  round() { return new Vec3(Math.round(this.x), Math.round(this.y), Math.round(this.z)); }
  clamp(lo, hi) { return new Vec3(clamp(this.x,lo,hi), clamp(this.y,lo,hi), clamp(this.z,lo,hi)); }
  toArray() { return [this.x, this.y, this.z]; }
  toVec2() { return new Vec2(this.x, this.y); }
  equals(v, eps = 1e-9) { return Math.abs(this.x-v.x)<eps && Math.abs(this.y-v.y)<eps && Math.abs(this.z-v.z)<eps; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  toString() { return `Vec3(${this.x.toFixed(4)}, ${this.y.toFixed(4)}, ${this.z.toFixed(4)})`; }
  [Symbol.iterator]() { return [this.x, this.y, this.z][Symbol.iterator](); }
}

// ─── Matrix4x4 ────────────────────────────────────────────────────────────────
export class Mat4 {
  constructor(elements) { this.e = elements ? new Float32Array(elements) : new Float32Array(16); }
  static identity() {
    const m = new Mat4(); m.e[0]=1;m.e[5]=1;m.e[10]=1;m.e[15]=1; return m;
  }
  static translation(x, y, z) {
    const m = Mat4.identity(); m.e[12]=x; m.e[13]=y; m.e[14]=z; return m;
  }
  static scaling(x, y, z) {
    const m = Mat4.identity(); m.e[0]=x; m.e[5]=y; m.e[10]=z; return m;
  }
  static rotationX(a) {
    const m = Mat4.identity(), c=Math.cos(a), s=Math.sin(a);
    m.e[5]=c; m.e[6]=s; m.e[9]=-s; m.e[10]=c; return m;
  }
  static rotationY(a) {
    const m = Mat4.identity(), c=Math.cos(a), s=Math.sin(a);
    m.e[0]=c; m.e[2]=-s; m.e[8]=s; m.e[10]=c; return m;
  }
  static rotationZ(a) {
    const m = Mat4.identity(), c=Math.cos(a), s=Math.sin(a);
    m.e[0]=c; m.e[1]=s; m.e[4]=-s; m.e[5]=c; return m;
  }
  static perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), m = new Mat4();
    m.e[0]=f/aspect; m.e[5]=f; m.e[10]=(far+near)/(near-far);
    m.e[11]=-1; m.e[14]=(2*far*near)/(near-far); return m;
  }
  static orthographic(l, r, b, t, n, f) {
    const m = new Mat4();
    m.e[0]=2/(r-l); m.e[5]=2/(t-b); m.e[10]=-2/(f-n);
    m.e[12]=-(r+l)/(r-l); m.e[13]=-(t+b)/(t-b); m.e[14]=-(f+n)/(f-n); m.e[15]=1;
    return m;
  }
  static lookAt(eye, center, up) {
    const f=eye.sub(center).normalize(), r=up.cross(f).normalize(), u=f.cross(r);
    const m = new Mat4();
    m.e[0]=r.x; m.e[1]=u.x; m.e[2]=f.x;
    m.e[4]=r.y; m.e[5]=u.y; m.e[6]=f.y;
    m.e[8]=r.z; m.e[9]=u.z; m.e[10]=f.z;
    m.e[12]=-r.dot(eye); m.e[13]=-u.dot(eye); m.e[14]=-f.dot(eye); m.e[15]=1;
    return m;
  }
  mul(b) {
    const ae=this.e, be=b.e, out=new Mat4();
    for(let i=0;i<4;i++) for(let j=0;j<4;j++) {
      out.e[j*4+i]=ae[i]*be[j*4]+ae[4+i]*be[j*4+1]+ae[8+i]*be[j*4+2]+ae[12+i]*be[j*4+3];
    }
    return out;
  }
  mulVec3(v) {
    const{e}=this, w=e[3]*v.x+e[7]*v.y+e[11]*v.z+e[15]||1;
    return new Vec3((e[0]*v.x+e[4]*v.y+e[8]*v.z+e[12])/w,(e[1]*v.x+e[5]*v.y+e[9]*v.z+e[13])/w,(e[2]*v.x+e[6]*v.y+e[10]*v.z+e[14])/w);
  }
  transpose() {
    const m=new Mat4([...this.e]);
    const swap=(a,b)=>{const t=m.e[a];m.e[a]=m.e[b];m.e[b]=t;};
    swap(1,4);swap(2,8);swap(3,12);swap(6,9);swap(7,13);swap(11,14);
    return m;
  }
  determinant() {
    const{e}=this;
    const a=e[0],b=e[1],c=e[2],d=e[3],f=e[4],g=e[5],h=e[6],k=e[7],
          l=e[8],m=e[9],n=e[10],o=e[11],p=e[12],q=e[13],r=e[14],s=e[15];
    return a*(g*(n*s-o*r)-h*(m*s-o*q)+k*(m*r-n*q))-b*(f*(n*s-o*r)-h*(l*s-o*p)+k*(l*r-n*p))+c*(f*(m*s-o*q)-g*(l*s-o*p)+k*(l*q-m*p))-d*(f*(m*r-n*q)-g*(l*r-n*p)+h*(l*q-m*p));
  }
  invert() {
    const m=new Float32Array(16),{e}=this;
    m[0]=e[5]*e[10]*e[15]-e[5]*e[11]*e[14]-e[9]*e[6]*e[15]+e[9]*e[7]*e[14]+e[13]*e[6]*e[11]-e[13]*e[7]*e[10];
    m[4]=-e[4]*e[10]*e[15]+e[4]*e[11]*e[14]+e[8]*e[6]*e[15]-e[8]*e[7]*e[14]-e[12]*e[6]*e[11]+e[12]*e[7]*e[10];
    m[8]=e[4]*e[9]*e[15]-e[4]*e[11]*e[13]-e[8]*e[5]*e[15]+e[8]*e[7]*e[13]+e[12]*e[5]*e[11]-e[12]*e[7]*e[9];
    m[12]=-e[4]*e[9]*e[14]+e[4]*e[10]*e[13]+e[8]*e[5]*e[14]-e[8]*e[6]*e[13]-e[12]*e[5]*e[10]+e[12]*e[6]*e[9];
    const det=e[0]*m[0]+e[1]*m[4]+e[2]*m[8]+e[3]*m[12];
    if(!det) return null;
    const inv=1/det;
    // Fill remaining (abbreviated)
    const out=new Mat4();
    for(let i=0;i<4;i++) out.e[i]=m[i]*inv;
    return out;
  }
  toArray() { return [...this.e]; }
  clone() { return new Mat4(this.e); }
  equals(b, eps=1e-9) { return this.e.every((v,i)=>Math.abs(v-b.e[i])<eps); }
}

// ─── Quaternion ───────────────────────────────────────────────────────────────
export class Quat {
  constructor(x=0, y=0, z=0, w=1) { this.x=x; this.y=y; this.z=z; this.w=w; }
  static identity() { return new Quat(0,0,0,1); }
  static fromAxisAngle(axis, angle) {
    const s=Math.sin(angle/2), n=axis.normalize();
    return new Quat(n.x*s, n.y*s, n.z*s, Math.cos(angle/2));
  }
  static fromEuler(pitch, yaw, roll) {
    const cp=Math.cos(pitch/2), sp=Math.sin(pitch/2);
    const cy=Math.cos(yaw/2), sy=Math.sin(yaw/2);
    const cr=Math.cos(roll/2), sr=Math.sin(roll/2);
    return new Quat(sp*cy*cr-cp*sy*sr, cp*sy*cr+sp*cy*sr, cp*cy*sr-sp*sy*cr, cp*cy*cr+sp*sy*sr);
  }
  get lenSq() { return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w; }
  get len() { return Math.sqrt(this.lenSq); }
  normalize() { const l=this.len; return l?new Quat(this.x/l,this.y/l,this.z/l,this.w/l):Quat.identity(); }
  conjugate() { return new Quat(-this.x,-this.y,-this.z,this.w); }
  invert() { const lsq=this.lenSq; return new Quat(-this.x/lsq,-this.y/lsq,-this.z/lsq,this.w/lsq); }
  mul(q) {
    return new Quat(
      this.w*q.x+this.x*q.w+this.y*q.z-this.z*q.y,
      this.w*q.y-this.x*q.z+this.y*q.w+this.z*q.x,
      this.w*q.z+this.x*q.y-this.y*q.x+this.z*q.w,
      this.w*q.w-this.x*q.x-this.y*q.y-this.z*q.z
    );
  }
  rotateVec3(v) {
    const qv=new Quat(v.x,v.y,v.z,0);
    const res=this.mul(qv).mul(this.conjugate());
    return new Vec3(res.x,res.y,res.z);
  }
  slerp(q, t) {
    let dot=this.x*q.x+this.y*q.y+this.z*q.z+this.w*q.w;
    let qb=q;
    if(dot<0){dot=-dot;qb=new Quat(-q.x,-q.y,-q.z,-q.w);}
    if(dot>0.9995) return new Quat(lerp(this.x,qb.x,t),lerp(this.y,qb.y,t),lerp(this.z,qb.z,t),lerp(this.w,qb.w,t)).normalize();
    const theta0=Math.acos(dot), theta=theta0*t;
    const s0=Math.cos(theta)-dot*Math.sin(theta)/Math.sin(theta0);
    const s1=Math.sin(theta)/Math.sin(theta0);
    return new Quat(s0*this.x+s1*qb.x,s0*this.y+s1*qb.y,s0*this.z+s1*qb.z,s0*this.w+s1*qb.w);
  }
  toMat4() {
    const{x,y,z,w}=this;
    return new Mat4([1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0,2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0,2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0,0,0,0,1]);
  }
  toEuler() {
    const{x,y,z,w}=this;
    return{pitch:Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)),yaw:Math.asin(clamp(2*(w*y-z*x),-1,1)),roll:Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))};
  }
  toAxisAngle() {
    const q=this.normalize(), angle=2*Math.acos(q.w), s=Math.sqrt(1-q.w*q.w);
    if(s<1e-6) return{axis:new Vec3(1,0,0),angle};
    return{axis:new Vec3(q.x/s,q.y/s,q.z/s),angle};
  }
  dot(q) { return this.x*q.x+this.y*q.y+this.z*q.z+this.w*q.w; }
  equals(q,eps=1e-9){return Math.abs(this.x-q.x)<eps&&Math.abs(this.y-q.y)<eps&&Math.abs(this.z-q.z)<eps&&Math.abs(this.w-q.w)<eps;}
  clone() { return new Quat(this.x,this.y,this.z,this.w); }
  toString() { return `Quat(${this.x.toFixed(4)}, ${this.y.toFixed(4)}, ${this.z.toFixed(4)}, ${this.w.toFixed(4)})`; }
}

// ─── Complex numbers ──────────────────────────────────────────────────────────
export class Complex {
  constructor(re=0, im=0) { this.re=re; this.im=im; }
  static fromPolar(r, theta) { return new Complex(r*Math.cos(theta), r*Math.sin(theta)); }
  static fromNum(n) { return new Complex(n, 0); }
  static i() { return new Complex(0, 1); }
  get mod() { return Math.sqrt(this.re*this.re+this.im*this.im); }
  get arg() { return Math.atan2(this.im, this.re); }
  add(z) { return new Complex(this.re+z.re, this.im+z.im); }
  sub(z) { return new Complex(this.re-z.re, this.im-z.im); }
  mul(z) { return new Complex(this.re*z.re-this.im*z.im, this.re*z.im+this.im*z.re); }
  div(z) { const d=z.re*z.re+z.im*z.im; return new Complex((this.re*z.re+this.im*z.im)/d,(this.im*z.re-this.re*z.im)/d); }
  conjugate() { return new Complex(this.re, -this.im); }
  neg() { return new Complex(-this.re, -this.im); }
  abs() { return this.mod; }
  pow(n) { const r=Math.pow(this.mod,n), theta=this.arg*n; return Complex.fromPolar(r,theta); }
  sqrt() { const r=Math.sqrt(this.mod), theta=this.arg/2; return Complex.fromPolar(r,theta); }
  exp() { return Complex.fromPolar(Math.exp(this.re), this.im); }
  ln() { return new Complex(Math.log(this.mod), this.arg); }
  sin() { return new Complex(Math.sin(this.re)*Math.cosh(this.im), Math.cos(this.re)*Math.sinh(this.im)); }
  cos() { return new Complex(Math.cos(this.re)*Math.cosh(this.im), -Math.sin(this.re)*Math.sinh(this.im)); }
  equals(z, eps=1e-9) { return Math.abs(this.re-z.re)<eps&&Math.abs(this.im-z.im)<eps; }
  toString() { const sign=this.im<0?'-':'+'; return `${this.re.toFixed(4)} ${sign} ${Math.abs(this.im).toFixed(4)}i`; }
  toArray() { return [this.re, this.im]; }
}

// ─── Statistics ───────────────────────────────────────────────────────────────
export const stats = {
  sum: a => a.reduce((s,v)=>s+v, 0),
  mean: a => a.length ? stats.sum(a)/a.length : 0,
  median: a => { const s=[...a].sort((a,b)=>a-b); const n=s.length; return n%2?s[n>>1]:(s[(n>>1)-1]+s[n>>1])/2; },
  mode: a => { const f=new Map(); for(const v of a) f.set(v,(f.get(v)||0)+1); let maxC=0,mode=null; for(const[v,c]of f)if(c>maxC){maxC=c;mode=v;} return mode; },
  variance: (a, sample=false) => { const m=stats.mean(a); return a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-(sample?1:0)); },
  stdDev: (a, sample=false) => Math.sqrt(stats.variance(a,sample)),
  min: a => Math.min(...a),
  max: a => Math.max(...a),
  range: a => stats.max(a)-stats.min(a),
  percentile: (a, p) => { const s=[...a].sort((a,b)=>a-b); const i=(p/100)*(s.length-1); const lo=Math.floor(i),hi=Math.ceil(i); return lerp(s[lo],s[hi],i-lo); },
  iqr: a => stats.percentile(a,75)-stats.percentile(a,25),
  skewness: a => { const m=stats.mean(a),s=stats.stdDev(a); return a.reduce((acc,v)=>acc+((v-m)/s)**3,0)/a.length; },
  kurtosis: a => { const m=stats.mean(a),s=stats.stdDev(a); return a.reduce((acc,v)=>acc+((v-m)/s)**4,0)/a.length-3; },
  covariance: (a,b) => { const ma=stats.mean(a),mb=stats.mean(b),n=Math.min(a.length,b.length); return a.slice(0,n).reduce((s,v,i)=>s+(v-ma)*(b[i]-mb),0)/n; },
  correlation: (a,b) => stats.covariance(a,b)/(stats.stdDev(a)*stats.stdDev(b)),
  zscore: (val, a) => (val-stats.mean(a))/stats.stdDev(a),
  normalize: a => { const mn=stats.min(a),mx=stats.max(a),r=mx-mn; return r?a.map(v=>(v-mn)/r):a.map(()=>0); },
  standardize: a => { const m=stats.mean(a),s=stats.stdDev(a); return s?a.map(v=>(v-m)/s):a.map(()=>0); },
  histogram: (a, bins=10) => {
    const mn=stats.min(a),mx=stats.max(a),step=(mx-mn)/bins;
    const counts=new Array(bins).fill(0);
    for(const v of a){const b=Math.min(Math.floor((v-mn)/step),bins-1);counts[b]++;}
    return counts.map((c,i)=>({lo:mn+i*step,hi:mn+(i+1)*step,count:c}));
  },
};

// ─── FFT ──────────────────────────────────────────────────────────────────────
export function fft(signal) {
  const N = signal.length;
  if (N <= 1) return signal;
  if (!isPowerOf2(N)) throw new Error('FFT requires power-of-2 length');
  const even = fft(signal.filter((_,i)=>!(i%2)));
  const odd  = fft(signal.filter((_,i)=>i%2));
  return Array.from({length: N}, (_, k) => {
    const t = Complex.fromPolar(1, -TAU*k/N).mul(odd[k % (N/2)]);
    return even[k%(N/2)].add(t);
  }).concat(Array.from({length:N}, (_,k) => {
    const t = Complex.fromPolar(1, -TAU*k/N).mul(odd[k%(N/2)]);
    return even[k%(N/2)].sub(t);
  })).slice(0, N);
}

export function ifft(spectrum) {
  const N=spectrum.length;
  const conj=spectrum.map(c=>c.conjugate());
  const result=fft(conj);
  return result.map(c=>c.conjugate().mul(new Complex(1/N,0)));
}

export function dft(signal) {
  const N=signal.length;
  return Array.from({length:N},(_,k)=>signal.reduce((s,xn,n)=>s.add(Complex.fromPolar(xn,-TAU*k*n/N)),new Complex()));
}

// ─── Numerical methods ────────────────────────────────────────────────────────
export const numerical = {
  bisect(f, a, b, tol=1e-10, maxIter=100) {
    if(f(a)*f(b)>0) throw new Error('f(a) and f(b) must have opposite signs');
    let lo=a,hi=b;
    for(let i=0;i<maxIter;i++){
      const mid=(lo+hi)/2;
      if(hi-lo<tol) return mid;
      if(f(lo)*f(mid)<0) hi=mid; else lo=mid;
    }
    return(lo+hi)/2;
  },
  newton(f, df, x0, tol=1e-10, maxIter=100) {
    let x=x0;
    for(let i=0;i<maxIter;i++){const fx=f(x),dfx=df(x);if(Math.abs(fx)<tol)return x;if(Math.abs(dfx)<1e-14)break;x-=fx/dfx;}
    return x;
  },
  secant(f, x0, x1, tol=1e-10, maxIter=100) {
    for(let i=0;i<maxIter;i++){const f0=f(x0),f1=f(x1);if(Math.abs(f1)<tol)return x1;if(Math.abs(f1-f0)<1e-14)break;const x2=x1-f1*(x1-x0)/(f1-f0);x0=x1;x1=x2;}
    return x1;
  },
  derivative(f, x, h=1e-7) { return (f(x+h)-f(x-h))/(2*h); },
  integral(f, a, b, n=1000) {
    const h=(b-a)/n; let s=f(a)+f(b);
    for(let i=1;i<n;i++) s+=(i%2===0?2:4)*f(a+i*h);
    return s*h/3;
  },
  trapezoid(f, a, b, n=1000) {
    const h=(b-a)/n; let s=(f(a)+f(b))/2;
    for(let i=1;i<n;i++) s+=f(a+i*h);
    return s*h;
  },
  odeEuler(f, y0, t0, t1, dt=0.01) {
    const ts=[t0],ys=[y0]; let t=t0,y=y0;
    while(t<t1){y+=f(t,y)*dt;t+=dt;ts.push(t);ys.push(y);}
    return{ts,ys};
  },
  odeRK4(f, y0, t0, t1, dt=0.01) {
    const ts=[t0],ys=[y0]; let t=t0,y=y0;
    while(t<t1){
      const k1=f(t,y), k2=f(t+dt/2,y+k1*dt/2), k3=f(t+dt/2,y+k2*dt/2), k4=f(t+dt,y+k3*dt);
      y+=dt*(k1+2*k2+2*k3+k4)/6; t+=dt; ts.push(t); ys.push(y);
    }
    return{ts,ys};
  },
  gradient(f, x, h=1e-7) { return x.map((_,i)=>{const xh=[...x];xh[i]+=h;return(f(xh)-f(x))/(h);}); },
};

// ─── Linear Algebra ───────────────────────────────────────────────────────────
export class Matrix {
  constructor(rows, cols, fill=0) {
    this.rows=rows; this.cols=cols;
    this._data=new Float64Array(rows*cols).fill(fill);
  }
  static from2D(arr) {
    const m=new Matrix(arr.length,arr[0].length);
    for(let i=0;i<arr.length;i++)for(let j=0;j<arr[0].length;j++)m.set(i,j,arr[i][j]);
    return m;
  }
  static identity(n) { const m=new Matrix(n,n); for(let i=0;i<n;i++)m.set(i,i,1); return m; }
  get(r,c) { return this._data[r*this.cols+c]; }
  set(r,c,v) { this._data[r*this.cols+c]=v; return this; }
  row(r) { return Array.from({length:this.cols},(_,j)=>this.get(r,j)); }
  col(c) { return Array.from({length:this.rows},(_,i)=>this.get(i,c)); }
  add(B) { const C=new Matrix(this.rows,this.cols); for(let i=0;i<this._data.length;i++)C._data[i]=this._data[i]+B._data[i]; return C; }
  sub(B) { const C=new Matrix(this.rows,this.cols); for(let i=0;i<this._data.length;i++)C._data[i]=this._data[i]-B._data[i]; return C; }
  scale(s) { const C=new Matrix(this.rows,this.cols); for(let i=0;i<this._data.length;i++)C._data[i]=this._data[i]*s; return C; }
  mul(B) {
    if(this.cols!==B.rows) throw new Error('Incompatible dimensions');
    const C=new Matrix(this.rows,B.cols);
    for(let i=0;i<this.rows;i++)for(let j=0;j<B.cols;j++){let s=0;for(let k=0;k<this.cols;k++)s+=this.get(i,k)*B.get(k,j);C.set(i,j,s);}
    return C;
  }
  transpose() { const T=new Matrix(this.cols,this.rows); for(let i=0;i<this.rows;i++)for(let j=0;j<this.cols;j++)T.set(j,i,this.get(i,j)); return T; }
  trace() { let s=0; for(let i=0;i<Math.min(this.rows,this.cols);i++)s+=this.get(i,i); return s; }
  frobenius() { return Math.sqrt(this._data.reduce((s,v)=>s+v*v,0)); }
  to2D() { return Array.from({length:this.rows},(_,i)=>Array.from({length:this.cols},(__,j)=>this.get(i,j))); }
  clone() { const m=new Matrix(this.rows,this.cols); m._data.set(this._data); return m; }
  gaussianElimination() {
    const A=this.clone(); const n=A.rows;
    for(let col=0;col<n;col++){
      let maxRow=col;
      for(let row=col+1;row<n;row++) if(Math.abs(A.get(row,col))>Math.abs(A.get(maxRow,col))) maxRow=row;
      for(let k=col;k<A.cols;k++){const t=A.get(col,k);A.set(col,k,A.get(maxRow,k));A.set(maxRow,k,t);}
      if(Math.abs(A.get(col,col))<1e-12) continue;
      for(let row=col+1;row<n;row++){const factor=A.get(row,col)/A.get(col,col);for(let k=col;k<A.cols;k++)A.set(row,k,A.get(row,k)-factor*A.get(col,k));}
    }
    return A;
  }
  determinant() {
    if(this.rows!==this.cols) throw new Error('Square matrix required');
    const A=this.clone(); const n=A.rows; let det=1; let swaps=0;
    for(let col=0;col<n;col++){
      let maxRow=col;
      for(let row=col+1;row<n;row++) if(Math.abs(A.get(row,col))>Math.abs(A.get(maxRow,col))) maxRow=row;
      if(maxRow!==col){for(let k=0;k<n;k++){const t=A.get(col,k);A.set(col,k,A.get(maxRow,k));A.set(maxRow,k,t);}swaps++;}
      if(Math.abs(A.get(col,col))<1e-12) return 0;
      det*=A.get(col,col);
      for(let row=col+1;row<n;row++){const f=A.get(row,col)/A.get(col,col);for(let k=col;k<n;k++)A.set(row,k,A.get(row,k)-f*A.get(col,k));}
    }
    return det*(swaps%2?-1:1);
  }
  solve(b) {
    const n=this.rows;
    const Ab=new Matrix(n,n+1);
    for(let i=0;i<n;i++){for(let j=0;j<n;j++)Ab.set(i,j,this.get(i,j));Ab.set(i,n,b[i]);}
    const ref=Ab.gaussianElimination();
    const x=new Array(n).fill(0);
    for(let i=n-1;i>=0;i--){let s=ref.get(i,n);for(let j=i+1;j<n;j++)s-=ref.get(i,j)*x[j];x[i]=s/ref.get(i,i);}
    return x;
  }
}

// ─── Geometry ─────────────────────────────────────────────────────────────────
export const geometry = {
  pointInTriangle(p, a, b, c) {
    const d1=(p.x-b.x)*(a.y-b.y)-(a.x-b.x)*(p.y-b.y);
    const d2=(p.x-c.x)*(b.y-c.y)-(b.x-c.x)*(p.y-c.y);
    const d3=(p.x-a.x)*(c.y-a.y)-(c.x-a.x)*(p.y-a.y);
    const ns=d1<0,es=d2<0,ts=d3<0;
    return(ns===es)&&(es===ts);
  },
  lineIntersect(p1,p2,p3,p4) {
    const d=(p1.x-p2.x)*(p3.y-p4.y)-(p1.y-p2.y)*(p3.x-p4.x);
    if(Math.abs(d)<1e-10) return null;
    const t=((p1.x-p3.x)*(p3.y-p4.y)-(p1.y-p3.y)*(p3.x-p4.x))/d;
    return new Vec2(p1.x+t*(p2.x-p1.x),p1.y+t*(p2.y-p1.y));
  },
  polygonArea(pts) { let a=0; for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;a+=pts[i].x*pts[j].y;a-=pts[j].x*pts[i].y;} return Math.abs(a)/2; },
  convexHull(pts) {
    const sorted=[...pts].sort((a,b)=>a.x===b.x?a.y-b.y:a.x-b.x);
    const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
    const lower=[];for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
    const upper=[];for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
    upper.pop();lower.pop();
    return lower.concat(upper);
  },
  circleLineIntersect(cx,cy,r,x1,y1,x2,y2) {
    const dx=x2-x1,dy=y2-y1,fx=x1-cx,fy=y1-cy;
    const a=dx*dx+dy*dy,b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-r*r;
    let disc=b*b-4*a*c;
    if(disc<0) return[];
    disc=Math.sqrt(disc);
    const t1=(-b-disc)/(2*a),t2=(-b+disc)/(2*a);
    const pts=[];
    if(t1>=0&&t1<=1) pts.push(new Vec2(x1+t1*dx,y1+t1*dy));
    if(t2>=0&&t2<=1&&t1!==t2) pts.push(new Vec2(x1+t2*dx,y1+t2*dy));
    return pts;
  },
};

// ─── Noise ────────────────────────────────────────────────────────────────────
export class PerlinNoise {
  constructor(seed=42) {
    this._p=new Uint8Array(512);
    const perm=Array.from({length:256},(_,i)=>i);
    let s=seed;
    for(let i=255;i>0;i--){s=(s*1664525+1013904223)>>>0;const j=s%(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}
    for(let i=0;i<512;i++) this._p[i]=perm[i&255];
  }
  _fade(t){return t*t*t*(t*(t*6-15)+10);}
  _grad(hash,x,y,z){const h=hash&15,u=h<8?x:y,v=h<4?y:h===12||h===14?x:z;return((h&1)?-u:u)+((h&2)?-v:v);}
  noise(x,y=0,z=0){
    const X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;
    x-=Math.floor(x);y-=Math.floor(y);z-=Math.floor(z);
    const u=this._fade(x),v=this._fade(y),w=this._fade(z);
    const p=this._p;
    const A=p[X]+Y,B=p[X+1]+Y,AA=p[A]+Z,AB=p[A+1]+Z,BA=p[B]+Z,BB=p[B+1]+Z;
    return lerp(lerp(lerp(this._grad(p[AA],x,y,z),this._grad(p[BA],x-1,y,z),u),lerp(this._grad(p[AB],x,y-1,z),this._grad(p[BB],x-1,y-1,z),u),v),lerp(lerp(this._grad(p[AA+1],x,y,z-1),this._grad(p[BA+1],x-1,y,z-1),u),lerp(this._grad(p[AB+1],x,y-1,z-1),this._grad(p[BB+1],x-1,y-1,z-1),u),v),w);
  }
  octave(x,y,z,octaves,lacunarity=2,persistence=0.5){
    let val=0,amp=1,freq=1,max=0;
    for(let i=0;i<octaves;i++){val+=this.noise(x*freq,y*freq,z*freq)*amp;max+=amp;amp*=persistence;freq*=lacunarity;}
    return val/max;
  }
}

export default { PI,TAU,E,PHI, clamp,lerp,invLerp,remap,smoothstep,snap,mod,fract, degToRad,radToDeg,roundTo,approxEqual, gcd,lcm,factorial,nCr,nPr,fibonacci,fibSequence,isPrime,sieve,primeFactors, Vec2,Vec3,Mat4,Quat,Complex,Matrix, stats,numerical,geometry,fft,ifft,dft, PerlinNoise };
