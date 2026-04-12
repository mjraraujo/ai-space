/* ============================================================================
 *  physics-engine.js — Lightweight 2D/3D physics engine
 *  Rigid-body dynamics, collision detection/response, constraints, spatial hash
 * ========================================================================== */

// ─── Vector Math ────────────────────────────────────────────────────────────
export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  clone() { return new Vec2(this.x, this.y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vec2(this.x * s, this.y * s); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  cross(v) { return this.x * v.y - this.y * v.x; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  lengthSq() { return this.x * this.x + this.y * this.y; }
  normalize() {
    const len = this.length();
    if (len < 1e-10) return new Vec2(0, 0);
    return this.scale(1 / len);
  }
  rotate(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  lerp(v, t) { return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t); }
  distanceTo(v) { return this.sub(v).length(); }
  angleTo(v) { return Math.atan2(v.y - this.y, v.x - this.x); }
  perpendicular() { return new Vec2(-this.y, this.x); }
  negate() { return new Vec2(-this.x, -this.y); }
  equals(v, eps = 1e-6) { return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps; }
  toArray() { return [this.x, this.y]; }
  static fromAngle(angle) { return new Vec2(Math.cos(angle), Math.sin(angle)); }
  static random(min = -1, max = 1) {
    return new Vec2(min + Math.random() * (max - min), min + Math.random() * (max - min));
  }
  static zero() { return new Vec2(0, 0); }
}

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  scale(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() {
    const len = this.length();
    if (len < 1e-10) return new Vec3(0, 0, 0);
    return this.scale(1 / len);
  }
  lerp(v, t) {
    return new Vec3(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t
    );
  }
  distanceTo(v) { return this.sub(v).length(); }
  negate() { return new Vec3(-this.x, -this.y, -this.z); }
  equals(v, eps = 1e-6) {
    return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps && Math.abs(this.z - v.z) < eps;
  }
  toArray() { return [this.x, this.y, this.z]; }
  static zero() { return new Vec3(0, 0, 0); }
  static up() { return new Vec3(0, 1, 0); }
  static right() { return new Vec3(1, 0, 0); }
  static forward() { return new Vec3(0, 0, 1); }
}

// ─── Matrix Math ────────────────────────────────────────────────────────────
export class Mat3 {
  constructor(data) { this.m = data || [1,0,0, 0,1,0, 0,0,1]; }
  static identity() { return new Mat3([1,0,0, 0,1,0, 0,0,1]); }
  static rotation(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Mat3([c,-s,0, s,c,0, 0,0,1]);
  }
  static translation(tx, ty) { return new Mat3([1,0,tx, 0,1,ty, 0,0,1]); }
  static scale(sx, sy) { return new Mat3([sx,0,0, 0,sy,0, 0,0,1]); }
  multiply(other) {
    const a = this.m, b = other.m, r = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
      }
    }
    return new Mat3(r);
  }
  transformVec2(v) {
    return new Vec2(
      this.m[0] * v.x + this.m[1] * v.y + this.m[2],
      this.m[3] * v.x + this.m[4] * v.y + this.m[5]
    );
  }
  determinant() {
    const m = this.m;
    return m[0] * (m[4] * m[8] - m[5] * m[7])
         - m[1] * (m[3] * m[8] - m[5] * m[6])
         + m[2] * (m[3] * m[7] - m[4] * m[6]);
  }
  inverse() {
    const d = this.determinant();
    if (Math.abs(d) < 1e-10) return null;
    const m = this.m, invD = 1 / d;
    return new Mat3([
      (m[4]*m[8]-m[5]*m[7])*invD, (m[2]*m[7]-m[1]*m[8])*invD, (m[1]*m[5]-m[2]*m[4])*invD,
      (m[5]*m[6]-m[3]*m[8])*invD, (m[0]*m[8]-m[2]*m[6])*invD, (m[2]*m[3]-m[0]*m[5])*invD,
      (m[3]*m[7]-m[4]*m[6])*invD, (m[1]*m[6]-m[0]*m[7])*invD, (m[0]*m[4]-m[1]*m[3])*invD
    ]);
  }
  transpose() {
    const m = this.m;
    return new Mat3([m[0],m[3],m[6], m[1],m[4],m[7], m[2],m[5],m[8]]);
  }
}

// ─── AABB ───────────────────────────────────────────────────────────────────
export class AABB {
  constructor(min, max) {
    this.min = min.clone();
    this.max = max.clone();
  }
  get width() { return this.max.x - this.min.x; }
  get height() { return this.max.y - this.min.y; }
  get center() { return this.min.add(this.max).scale(0.5); }
  get halfExtents() { return this.max.sub(this.min).scale(0.5); }
  contains(point) {
    return point.x >= this.min.x && point.x <= this.max.x &&
           point.y >= this.min.y && point.y <= this.max.y;
  }
  intersects(other) {
    return this.min.x <= other.max.x && this.max.x >= other.min.x &&
           this.min.y <= other.max.y && this.max.y >= other.min.y;
  }
  merge(other) {
    return new AABB(
      new Vec2(Math.min(this.min.x, other.min.x), Math.min(this.min.y, other.min.y)),
      new Vec2(Math.max(this.max.x, other.max.x), Math.max(this.max.y, other.max.y))
    );
  }
  expand(margin) {
    const m = new Vec2(margin, margin);
    return new AABB(this.min.sub(m), this.max.add(m));
  }
  area() { return this.width * this.height; }
  perimeter() { return 2 * (this.width + this.height); }
  static fromCircle(center, radius) {
    const r = new Vec2(radius, radius);
    return new AABB(center.sub(r), center.add(r));
  }
  static fromPoints(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return new AABB(new Vec2(minX, minY), new Vec2(maxX, maxY));
  }
}

// ─── Shape Types ────────────────────────────────────────────────────────────
export const ShapeType = { CIRCLE: 'circle', POLYGON: 'polygon', EDGE: 'edge' };

export class CircleShape {
  constructor(radius = 1, offset = Vec2.zero()) {
    this.type = ShapeType.CIRCLE;
    this.radius = radius;
    this.offset = offset;
  }
  computeAABB(position, _angle) {
    const center = position.add(this.offset);
    return AABB.fromCircle(center, this.radius);
  }
  computeMass(density) {
    const area = Math.PI * this.radius * this.radius;
    const mass = density * area;
    const inertia = 0.5 * mass * this.radius * this.radius;
    return { mass, inertia, area };
  }
  getSupport(direction) {
    return this.offset.add(direction.normalize().scale(this.radius));
  }
  containsPoint(point, bodyPos, _bodyAngle) {
    const center = bodyPos.add(this.offset);
    return point.sub(center).lengthSq() <= this.radius * this.radius;
  }
}

export class PolygonShape {
  constructor(vertices) {
    if (vertices.length < 3) throw new Error('Polygon needs at least 3 vertices');
    this.type = ShapeType.POLYGON;
    this.vertices = vertices.map(v => v.clone());
    this.normals = this._computeNormals();
  }
  _computeNormals() {
    const normals = [];
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[(i + 1) % n];
      const edge = v2.sub(v1);
      normals.push(new Vec2(edge.y, -edge.x).normalize());
    }
    return normals;
  }
  computeAABB(position, angle) {
    const transformed = this.getTransformedVertices(position, angle);
    return AABB.fromPoints(transformed);
  }
  computeMass(density) {
    let area = 0, cx = 0, cy = 0, inertia = 0;
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const v1 = this.vertices[i];
      const v2 = this.vertices[(i + 1) % n];
      const cross = v1.cross(v2);
      area += cross;
      cx += (v1.x + v2.x) * cross;
      cy += (v1.y + v2.y) * cross;
      inertia += cross * (v1.dot(v1) + v1.dot(v2) + v2.dot(v2));
    }
    area *= 0.5;
    const mass = density * Math.abs(area);
    if (Math.abs(area) > 1e-10) {
      cx /= (6 * area);
      cy /= (6 * area);
    }
    inertia = density * Math.abs(inertia) / 12;
    return { mass, inertia, area: Math.abs(area), centroid: new Vec2(cx, cy) };
  }
  getTransformedVertices(position, angle) {
    return this.vertices.map(v => v.rotate(angle).add(position));
  }
  getTransformedNormals(angle) {
    return this.normals.map(n => n.rotate(angle));
  }
  getSupport(direction) {
    let bestDot = -Infinity, bestVertex = null;
    for (const v of this.vertices) {
      const dot = v.dot(direction);
      if (dot > bestDot) { bestDot = dot; bestVertex = v; }
    }
    return bestVertex.clone();
  }
  containsPoint(point, bodyPos, bodyAngle) {
    const local = point.sub(bodyPos).rotate(-bodyAngle);
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const v = this.vertices[i];
      const edge = this.vertices[(i + 1) % n].sub(v);
      const toPoint = local.sub(v);
      if (edge.cross(toPoint) < 0) return false;
    }
    return true;
  }
  static createBox(width, height) {
    const hw = width / 2, hh = height / 2;
    return new PolygonShape([
      new Vec2(-hw, -hh), new Vec2(hw, -hh),
      new Vec2(hw, hh), new Vec2(-hw, hh)
    ]);
  }
  static createRegular(radius, sides) {
    const verts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
      verts.push(new Vec2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
    return new PolygonShape(verts);
  }
}

export class EdgeShape {
  constructor(v1, v2) {
    this.type = ShapeType.EDGE;
    this.v1 = v1.clone();
    this.v2 = v2.clone();
    this.normal = v2.sub(v1).perpendicular().normalize();
  }
  computeAABB(position, angle) {
    const tv1 = this.v1.rotate(angle).add(position);
    const tv2 = this.v2.rotate(angle).add(position);
    return AABB.fromPoints([tv1, tv2]).expand(0.01);
  }
  computeMass(_density) { return { mass: 0, inertia: 0, area: 0 }; }
  getLength() { return this.v2.sub(this.v1).length(); }
}

// ─── Material ───────────────────────────────────────────────────────────────
export class Material {
  constructor(opts = {}) {
    this.density = opts.density ?? 1;
    this.restitution = opts.restitution ?? 0.3;
    this.friction = opts.friction ?? 0.4;
    this.staticFriction = opts.staticFriction ?? opts.friction ?? 0.6;
  }
  static steel() { return new Material({ density: 7.8, restitution: 0.1, friction: 0.6 }); }
  static rubber() { return new Material({ density: 1.2, restitution: 0.8, friction: 0.9 }); }
  static ice() { return new Material({ density: 0.9, restitution: 0.05, friction: 0.02 }); }
  static wood() { return new Material({ density: 0.6, restitution: 0.4, friction: 0.5 }); }
  static bouncy() { return new Material({ density: 0.5, restitution: 0.95, friction: 0.3 }); }
}

// ─── Rigid Body ─────────────────────────────────────────────────────────────
let _bodyIdCounter = 0;

export class RigidBody {
  constructor(shape, opts = {}) {
    this.id = ++_bodyIdCounter;
    this.shape = shape;
    this.material = opts.material || new Material();
    this.position = opts.position ? opts.position.clone() : Vec2.zero();
    this.velocity = opts.velocity ? opts.velocity.clone() : Vec2.zero();
    this.angle = opts.angle || 0;
    this.angularVelocity = opts.angularVelocity || 0;
    this.force = Vec2.zero();
    this.torque = 0;
    this.isStatic = opts.isStatic || false;
    this.isSensor = opts.isSensor || false;
    this.isKinematic = opts.isKinematic || false;
    this.gravityScale = opts.gravityScale ?? 1;
    this.linearDamping = opts.linearDamping ?? 0.01;
    this.angularDamping = opts.angularDamping ?? 0.01;
    this.userData = opts.userData || null;
    this.sleepThreshold = opts.sleepThreshold ?? 0.01;
    this.sleepTimer = 0;
    this.isSleeping = false;
    this.category = opts.category ?? 0x0001;
    this.mask = opts.mask ?? 0xFFFF;
    this.group = opts.group ?? 0;

    const massData = shape.computeMass(this.material.density);
    if (this.isStatic || this.isKinematic) {
      this.mass = 0;
      this.invMass = 0;
      this.inertia = 0;
      this.invInertia = 0;
    } else {
      this.mass = massData.mass;
      this.invMass = massData.mass > 0 ? 1 / massData.mass : 0;
      this.inertia = massData.inertia;
      this.invInertia = massData.inertia > 0 ? 1 / massData.inertia : 0;
    }
    this._aabb = null;
    this._aabbDirty = true;
  }

  applyForce(force, point) {
    this.force = this.force.add(force);
    if (point) {
      const r = point.sub(this.position);
      this.torque += r.cross(force);
    }
  }

  applyImpulse(impulse, point) {
    this.velocity = this.velocity.add(impulse.scale(this.invMass));
    if (point) {
      const r = point.sub(this.position);
      this.angularVelocity += this.invInertia * r.cross(impulse);
    }
    this.wake();
  }

  applyTorque(torque) { this.torque += torque; }

  setPosition(pos) {
    this.position = pos.clone();
    this._aabbDirty = true;
    this.wake();
  }

  setVelocity(vel) {
    this.velocity = vel.clone();
    this.wake();
  }

  setAngle(angle) {
    this.angle = angle;
    this._aabbDirty = true;
    this.wake();
  }

  getAABB() {
    if (this._aabbDirty) {
      this._aabb = this.shape.computeAABB(this.position, this.angle);
      this._aabbDirty = false;
    }
    return this._aabb;
  }

  wake() {
    this.isSleeping = false;
    this.sleepTimer = 0;
  }

  sleep() {
    this.isSleeping = true;
    this.velocity = Vec2.zero();
    this.angularVelocity = 0;
  }

  integrateForces(dt, gravity) {
    if (this.isStatic || this.isKinematic || this.isSleeping) return;
    const accel = gravity.scale(this.gravityScale).add(this.force.scale(this.invMass));
    this.velocity = this.velocity.add(accel.scale(dt));
    this.angularVelocity += this.torque * this.invInertia * dt;
  }

  integrateVelocity(dt) {
    if (this.isStatic || this.isKinematic || this.isSleeping) return;
    this.position = this.position.add(this.velocity.scale(dt));
    this.angle += this.angularVelocity * dt;
    this.velocity = this.velocity.scale(1 - this.linearDamping);
    this.angularVelocity *= (1 - this.angularDamping);
    this._aabbDirty = true;
    this.force = Vec2.zero();
    this.torque = 0;
  }

  updateSleep(dt) {
    if (this.isStatic) return;
    const energy = this.velocity.lengthSq() + this.angularVelocity * this.angularVelocity;
    if (energy < this.sleepThreshold) {
      this.sleepTimer += dt;
      if (this.sleepTimer > 0.5) this.sleep();
    } else {
      this.sleepTimer = 0;
      this.isSleeping = false;
    }
  }

  canCollideWith(other) {
    if (this.group !== 0 && this.group === other.group) return this.group > 0;
    return (this.mask & other.category) !== 0 && (other.mask & this.category) !== 0;
  }

  getKineticEnergy() {
    const linear = 0.5 * this.mass * this.velocity.lengthSq();
    const angular = 0.5 * this.inertia * this.angularVelocity * this.angularVelocity;
    return linear + angular;
  }

  getMomentum() { return this.velocity.scale(this.mass); }
}

// ─── Contact / Manifold ─────────────────────────────────────────────────────
export class Contact {
  constructor(point, normal, depth) {
    this.point = point;
    this.normal = normal;
    this.depth = depth;
    this.normalImpulse = 0;
    this.tangentImpulse = 0;
  }
}

export class Manifold {
  constructor(bodyA, bodyB) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.contacts = [];
    this.normal = Vec2.zero();
    this.depth = 0;
  }
}

// ─── Collision Detection ────────────────────────────────────────────────────
export class CollisionDetector {
  static circleVsCircle(a, b) {
    const posA = a.position.add(a.shape.offset);
    const posB = b.position.add(b.shape.offset);
    const diff = posB.sub(posA);
    const dist = diff.length();
    const radiusSum = a.shape.radius + b.shape.radius;
    if (dist >= radiusSum) return null;

    const manifold = new Manifold(a, b);
    const normal = dist > 1e-10 ? diff.scale(1 / dist) : new Vec2(1, 0);
    const depth = radiusSum - dist;
    const contactPoint = posA.add(normal.scale(a.shape.radius));
    manifold.normal = normal;
    manifold.depth = depth;
    manifold.contacts.push(new Contact(contactPoint, normal, depth));
    return manifold;
  }

  static circleVsPolygon(circleBody, polyBody) {
    const circlePos = circleBody.position.add(circleBody.shape.offset);
    const radius = circleBody.shape.radius;
    const vertices = polyBody.shape.getTransformedVertices(polyBody.position, polyBody.angle);
    const normals = polyBody.shape.getTransformedNormals(polyBody.angle);

    let minOverlap = Infinity;
    let bestNormal = null;
    let bestVertex = null;

    // Check polygon face normals
    for (let i = 0; i < vertices.length; i++) {
      const proj = circlePos.sub(vertices[i]).dot(normals[i]);
      if (proj > radius) return null;
      const overlap = radius - proj;
      if (overlap < minOverlap) {
        minOverlap = overlap;
        bestNormal = normals[i];
      }
    }

    // Find closest vertex
    let minDistSq = Infinity;
    for (const v of vertices) {
      const dSq = circlePos.sub(v).lengthSq();
      if (dSq < minDistSq) { minDistSq = dSq; bestVertex = v; }
    }

    // Check vertex region
    const toCircle = circlePos.sub(bestVertex);
    const dist = toCircle.length();
    if (dist > radius) {
      // Only in vertex region
      if (minOverlap > radius) return null;
    }

    const manifold = new Manifold(circleBody, polyBody);
    manifold.normal = bestNormal.negate();
    manifold.depth = minOverlap;
    const contactPoint = circlePos.add(bestNormal.scale(-radius));
    manifold.contacts.push(new Contact(contactPoint, manifold.normal, minOverlap));
    return manifold;
  }

  static polygonVsPolygon(a, b) {
    const vertsA = a.shape.getTransformedVertices(a.position, a.angle);
    const normsA = a.shape.getTransformedNormals(a.angle);
    const vertsB = b.shape.getTransformedVertices(b.position, b.angle);
    const normsB = b.shape.getTransformedNormals(b.angle);

    let minOverlap = Infinity;
    let bestNormal = null;
    let fromA = true;

    // SAT test with A's normals
    for (const normal of normsA) {
      const [minA, maxA] = projectPolygon(vertsA, normal);
      const [minB, maxB] = projectPolygon(vertsB, normal);
      const overlap = Math.min(maxA - minB, maxB - minA);
      if (overlap <= 0) return null;
      if (overlap < minOverlap) { minOverlap = overlap; bestNormal = normal; fromA = true; }
    }

    // SAT test with B's normals
    for (const normal of normsB) {
      const [minA, maxA] = projectPolygon(vertsA, normal);
      const [minB, maxB] = projectPolygon(vertsB, normal);
      const overlap = Math.min(maxA - minB, maxB - minA);
      if (overlap <= 0) return null;
      if (overlap < minOverlap) { minOverlap = overlap; bestNormal = normal; fromA = false; }
    }

    // Ensure normal points from A to B
    const direction = b.position.sub(a.position);
    if (direction.dot(bestNormal) < 0) bestNormal = bestNormal.negate();

    const manifold = new Manifold(a, b);
    manifold.normal = bestNormal;
    manifold.depth = minOverlap;

    // Find contact points via clipping
    const contacts = findContactPoints(vertsA, vertsB, bestNormal, fromA);
    manifold.contacts = contacts;
    return manifold;
  }

  static detect(a, b) {
    if (a.shape.type === ShapeType.CIRCLE && b.shape.type === ShapeType.CIRCLE) {
      return this.circleVsCircle(a, b);
    }
    if (a.shape.type === ShapeType.CIRCLE && b.shape.type === ShapeType.POLYGON) {
      return this.circleVsPolygon(a, b);
    }
    if (a.shape.type === ShapeType.POLYGON && b.shape.type === ShapeType.CIRCLE) {
      const m = this.circleVsPolygon(b, a);
      if (m) { [m.bodyA, m.bodyB] = [m.bodyB, m.bodyA]; m.normal = m.normal.negate(); }
      return m;
    }
    if (a.shape.type === ShapeType.POLYGON && b.shape.type === ShapeType.POLYGON) {
      return this.polygonVsPolygon(a, b);
    }
    return null;
  }
}

function projectPolygon(vertices, axis) {
  let min = Infinity, max = -Infinity;
  for (const v of vertices) {
    const proj = v.dot(axis);
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return [min, max];
}

function findContactPoints(vertsA, vertsB, normal, _fromA) {
  // Find deepest penetrating vertex
  let bestDepth = -Infinity;
  let bestPoint = null;
  for (const v of vertsB) {
    let minDist = Infinity;
    for (let i = 0; i < vertsA.length; i++) {
      const edge = vertsA[(i + 1) % vertsA.length].sub(vertsA[i]);
      const toV = v.sub(vertsA[i]);
      const dist = edge.cross(toV) / edge.length();
      if (dist < minDist) minDist = dist;
    }
    if (-minDist > bestDepth) { bestDepth = -minDist; bestPoint = v; }
  }
  if (!bestPoint) bestPoint = vertsB[0];
  return [new Contact(bestPoint, normal, Math.max(0, bestDepth))];
}

// ─── Spatial Hash ───────────────────────────────────────────────────────────
export class SpatialHash {
  constructor(cellSize = 100) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.objectCells = new Map();
  }

  _hash(x, y) { return `${x},${y}`; }

  _getCells(aabb) {
    const minX = Math.floor(aabb.min.x / this.cellSize);
    const minY = Math.floor(aabb.min.y / this.cellSize);
    const maxX = Math.floor(aabb.max.x / this.cellSize);
    const maxY = Math.floor(aabb.max.y / this.cellSize);
    const cells = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push(this._hash(x, y));
      }
    }
    return cells;
  }

  insert(body) {
    const aabb = body.getAABB();
    const cells = this._getCells(aabb);
    this.objectCells.set(body.id, cells);
    for (const key of cells) {
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key).add(body);
    }
  }

  remove(body) {
    const cells = this.objectCells.get(body.id);
    if (!cells) return;
    for (const key of cells) {
      const cell = this.cells.get(key);
      if (cell) {
        cell.delete(body);
        if (cell.size === 0) this.cells.delete(key);
      }
    }
    this.objectCells.delete(body.id);
  }

  update(body) {
    this.remove(body);
    this.insert(body);
  }

  query(aabb) {
    const result = new Set();
    const cells = this._getCells(aabb);
    for (const key of cells) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const body of cell) result.add(body);
      }
    }
    return result;
  }

  queryPoint(point) {
    const key = this._hash(
      Math.floor(point.x / this.cellSize),
      Math.floor(point.y / this.cellSize)
    );
    return this.cells.get(key) || new Set();
  }

  clear() {
    this.cells.clear();
    this.objectCells.clear();
  }

  getPairs() {
    const pairs = new Set();
    for (const [, cell] of this.cells) {
      const bodies = Array.from(cell);
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          pairs.add(key);
        }
      }
    }
    return Array.from(pairs).map(key => {
      const [idA, idB] = key.split(':').map(Number);
      return [idA, idB];
    });
  }
}

// ─── Constraints ────────────────────────────────────────────────────────────
export class DistanceConstraint {
  constructor(bodyA, bodyB, opts = {}) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.anchorA = opts.anchorA || Vec2.zero();
    this.anchorB = opts.anchorB || Vec2.zero();
    this.distance = opts.distance ?? bodyA.position.add(this.anchorA).distanceTo(bodyB.position.add(this.anchorB));
    this.stiffness = opts.stiffness ?? 1;
    this.damping = opts.damping ?? 0;
    this.minDistance = opts.minDistance ?? 0;
    this.maxDistance = opts.maxDistance ?? Infinity;
  }

  solve(_dt) {
    const worldA = this.bodyA.position.add(this.anchorA.rotate(this.bodyA.angle));
    const worldB = this.bodyB.position.add(this.anchorB.rotate(this.bodyB.angle));
    const diff = worldB.sub(worldA);
    const dist = diff.length();
    if (dist < 1e-10) return;

    let targetDist = this.distance;
    targetDist = Math.max(this.minDistance, Math.min(this.maxDistance, targetDist));

    const error = dist - targetDist;
    const normal = diff.scale(1 / dist);
    const correction = normal.scale(error * this.stiffness);

    const totalInvMass = this.bodyA.invMass + this.bodyB.invMass;
    if (totalInvMass < 1e-10) return;

    const ratioA = this.bodyA.invMass / totalInvMass;
    const ratioB = this.bodyB.invMass / totalInvMass;

    if (!this.bodyA.isStatic) {
      this.bodyA.position = this.bodyA.position.add(correction.scale(ratioA));
      this.bodyA._aabbDirty = true;
    }
    if (!this.bodyB.isStatic) {
      this.bodyB.position = this.bodyB.position.sub(correction.scale(ratioB));
      this.bodyB._aabbDirty = true;
    }

    // Velocity damping
    if (this.damping > 0) {
      const relVel = this.bodyB.velocity.sub(this.bodyA.velocity).dot(normal);
      const dampImpulse = normal.scale(relVel * this.damping);
      this.bodyA.velocity = this.bodyA.velocity.add(dampImpulse.scale(this.bodyA.invMass));
      this.bodyB.velocity = this.bodyB.velocity.sub(dampImpulse.scale(this.bodyB.invMass));
    }
  }
}

export class SpringConstraint {
  constructor(bodyA, bodyB, opts = {}) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.anchorA = opts.anchorA || Vec2.zero();
    this.anchorB = opts.anchorB || Vec2.zero();
    this.restLength = opts.restLength ?? bodyA.position.distanceTo(bodyB.position);
    this.stiffness = opts.stiffness ?? 50;
    this.damping = opts.damping ?? 5;
  }

  solve(dt) {
    const worldA = this.bodyA.position.add(this.anchorA.rotate(this.bodyA.angle));
    const worldB = this.bodyB.position.add(this.anchorB.rotate(this.bodyB.angle));
    const diff = worldB.sub(worldA);
    const dist = diff.length();
    if (dist < 1e-10) return;

    const normal = diff.scale(1 / dist);
    const extension = dist - this.restLength;
    const springForce = normal.scale(this.stiffness * extension);

    const relVel = this.bodyB.velocity.sub(this.bodyA.velocity).dot(normal);
    const dampForce = normal.scale(this.damping * relVel);

    const force = springForce.add(dampForce);
    this.bodyA.applyForce(force, worldA);
    this.bodyB.applyForce(force.negate(), worldB);
  }
}

export class RevoluteConstraint {
  constructor(bodyA, bodyB, opts = {}) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.anchorA = opts.anchorA || Vec2.zero();
    this.anchorB = opts.anchorB || Vec2.zero();
    this.enableLimits = opts.enableLimits || false;
    this.lowerAngle = opts.lowerAngle ?? -Math.PI;
    this.upperAngle = opts.upperAngle ?? Math.PI;
    this.enableMotor = opts.enableMotor || false;
    this.motorSpeed = opts.motorSpeed ?? 0;
    this.maxMotorTorque = opts.maxMotorTorque ?? 100;
  }

  solve(_dt) {
    const worldA = this.bodyA.position.add(this.anchorA.rotate(this.bodyA.angle));
    const worldB = this.bodyB.position.add(this.anchorB.rotate(this.bodyB.angle));
    const diff = worldB.sub(worldA);

    const totalInvMass = this.bodyA.invMass + this.bodyB.invMass;
    if (totalInvMass < 1e-10) return;

    const correction = diff.scale(0.8);
    const ratioA = this.bodyA.invMass / totalInvMass;
    const ratioB = this.bodyB.invMass / totalInvMass;

    if (!this.bodyA.isStatic) {
      this.bodyA.position = this.bodyA.position.add(correction.scale(ratioA));
      this.bodyA._aabbDirty = true;
    }
    if (!this.bodyB.isStatic) {
      this.bodyB.position = this.bodyB.position.sub(correction.scale(ratioB));
      this.bodyB._aabbDirty = true;
    }

    // Angle limits
    if (this.enableLimits) {
      const relAngle = this.bodyB.angle - this.bodyA.angle;
      if (relAngle < this.lowerAngle) {
        const correction = (this.lowerAngle - relAngle) * 0.5;
        if (!this.bodyA.isStatic) this.bodyA.angle -= correction * ratioA;
        if (!this.bodyB.isStatic) this.bodyB.angle += correction * ratioB;
      } else if (relAngle > this.upperAngle) {
        const correction = (relAngle - this.upperAngle) * 0.5;
        if (!this.bodyA.isStatic) this.bodyA.angle += correction * ratioA;
        if (!this.bodyB.isStatic) this.bodyB.angle -= correction * ratioB;
      }
    }

    // Motor
    if (this.enableMotor) {
      const relSpeed = this.bodyB.angularVelocity - this.bodyA.angularVelocity;
      let motorImpulse = (this.motorSpeed - relSpeed);
      motorImpulse = Math.max(-this.maxMotorTorque, Math.min(this.maxMotorTorque, motorImpulse));
      if (!this.bodyA.isStatic) this.bodyA.angularVelocity -= motorImpulse * this.bodyA.invInertia;
      if (!this.bodyB.isStatic) this.bodyB.angularVelocity += motorImpulse * this.bodyB.invInertia;
    }
  }
}

export class PrismaticConstraint {
  constructor(bodyA, bodyB, opts = {}) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.axis = (opts.axis || new Vec2(1, 0)).normalize();
    this.anchorA = opts.anchorA || Vec2.zero();
    this.anchorB = opts.anchorB || Vec2.zero();
    this.lowerTranslation = opts.lowerTranslation ?? -Infinity;
    this.upperTranslation = opts.upperTranslation ?? Infinity;
    this.enableMotor = opts.enableMotor || false;
    this.motorSpeed = opts.motorSpeed ?? 0;
    this.maxMotorForce = opts.maxMotorForce ?? 100;
  }

  solve(_dt) {
    const worldA = this.bodyA.position.add(this.anchorA.rotate(this.bodyA.angle));
    const worldB = this.bodyB.position.add(this.anchorB.rotate(this.bodyB.angle));
    const diff = worldB.sub(worldA);
    const axisWorld = this.axis.rotate(this.bodyA.angle);
    const perpendicular = axisWorld.perpendicular();

    // Constrain to axis
    const perpError = diff.dot(perpendicular);
    const perpCorrection = perpendicular.scale(-perpError * 0.8);

    const totalInvMass = this.bodyA.invMass + this.bodyB.invMass;
    if (totalInvMass < 1e-10) return;

    const ratioA = this.bodyA.invMass / totalInvMass;
    const ratioB = this.bodyB.invMass / totalInvMass;

    if (!this.bodyA.isStatic) {
      this.bodyA.position = this.bodyA.position.sub(perpCorrection.scale(ratioA));
      this.bodyA._aabbDirty = true;
    }
    if (!this.bodyB.isStatic) {
      this.bodyB.position = this.bodyB.position.add(perpCorrection.scale(ratioB));
      this.bodyB._aabbDirty = true;
    }

    // Translation limits
    const translation = diff.dot(axisWorld);
    if (translation < this.lowerTranslation) {
      const correction = axisWorld.scale((this.lowerTranslation - translation) * 0.5);
      if (!this.bodyA.isStatic) this.bodyA.position = this.bodyA.position.sub(correction.scale(ratioA));
      if (!this.bodyB.isStatic) this.bodyB.position = this.bodyB.position.add(correction.scale(ratioB));
    } else if (translation > this.upperTranslation) {
      const correction = axisWorld.scale((translation - this.upperTranslation) * 0.5);
      if (!this.bodyA.isStatic) this.bodyA.position = this.bodyA.position.add(correction.scale(ratioA));
      if (!this.bodyB.isStatic) this.bodyB.position = this.bodyB.position.sub(correction.scale(ratioB));
    }
  }
}

// ─── Collision Resolver ─────────────────────────────────────────────────────
export class CollisionResolver {
  static resolve(manifold) {
    const { bodyA, bodyB, contacts, normal } = manifold;
    if (bodyA.isSensor || bodyB.isSensor) return;

    const restitution = Math.min(bodyA.material.restitution, bodyB.material.restitution);
    const friction = Math.sqrt(bodyA.material.friction * bodyB.material.friction);

    for (const contact of contacts) {
      const rA = contact.point.sub(bodyA.position);
      const rB = contact.point.sub(bodyB.position);

      const velA = bodyA.velocity.add(new Vec2(-bodyA.angularVelocity * rA.y, bodyA.angularVelocity * rA.x));
      const velB = bodyB.velocity.add(new Vec2(-bodyB.angularVelocity * rB.y, bodyB.angularVelocity * rB.x));
      const relVel = velB.sub(velA);

      const contactVelN = relVel.dot(normal);
      if (contactVelN > 0) continue; // Separating

      const rACrossN = rA.cross(normal);
      const rBCrossN = rB.cross(normal);
      const invMassSum = bodyA.invMass + bodyB.invMass +
        rACrossN * rACrossN * bodyA.invInertia +
        rBCrossN * rBCrossN * bodyB.invInertia;

      let j = -(1 + restitution) * contactVelN / invMassSum;
      j /= contacts.length;

      const impulse = normal.scale(j);
      bodyA.applyImpulse(impulse.negate(), contact.point);
      bodyB.applyImpulse(impulse, contact.point);

      // Friction
      const tangent = relVel.sub(normal.scale(relVel.dot(normal)));
      const tangentLen = tangent.length();
      if (tangentLen < 1e-10) continue;
      const tangentDir = tangent.scale(1 / tangentLen);

      const rACrossT = rA.cross(tangentDir);
      const rBCrossT = rB.cross(tangentDir);
      const invMassSumT = bodyA.invMass + bodyB.invMass +
        rACrossT * rACrossT * bodyA.invInertia +
        rBCrossT * rBCrossT * bodyB.invInertia;

      let jt = -relVel.dot(tangentDir) / invMassSumT;
      jt /= contacts.length;

      // Coulomb friction
      const frictionImpulse = Math.abs(jt) < j * friction
        ? tangentDir.scale(jt)
        : tangentDir.scale(-j * friction);

      bodyA.applyImpulse(frictionImpulse.negate(), contact.point);
      bodyB.applyImpulse(frictionImpulse, contact.point);
    }

    // Positional correction (Baumgarte)
    const slop = 0.01;
    const percent = 0.4;
    const depth = manifold.depth;
    if (depth > slop) {
      const totalInvMass = bodyA.invMass + bodyB.invMass;
      if (totalInvMass > 0) {
        const correction = normal.scale((depth - slop) * percent / totalInvMass);
        if (!bodyA.isStatic) {
          bodyA.position = bodyA.position.sub(correction.scale(bodyA.invMass));
          bodyA._aabbDirty = true;
        }
        if (!bodyB.isStatic) {
          bodyB.position = bodyB.position.add(correction.scale(bodyB.invMass));
          bodyB._aabbDirty = true;
        }
      }
    }
  }
}

// ─── Ray Casting ────────────────────────────────────────────────────────────
export class RaycastResult {
  constructor(body, point, normal, fraction) {
    this.body = body;
    this.point = point;
    this.normal = normal;
    this.fraction = fraction;
  }
}

export function raycastCircle(origin, direction, maxDist, body) {
  const center = body.position.add(body.shape.offset);
  const radius = body.shape.radius;
  const oc = origin.sub(center);
  const a = direction.dot(direction);
  const b = 2 * oc.dot(direction);
  const c = oc.dot(oc) - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxDist) return null;
  const point = origin.add(direction.scale(t));
  const normal = point.sub(center).normalize();
  return new RaycastResult(body, point, normal, t / maxDist);
}

export function raycastPolygon(origin, direction, maxDist, body) {
  const vertices = body.shape.getTransformedVertices(body.position, body.angle);
  let tMin = Infinity;
  let hitNormal = null;

  for (let i = 0; i < vertices.length; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const edge = v2.sub(v1);
    const denom = direction.cross(edge);
    if (Math.abs(denom) < 1e-10) continue;

    const t = v1.sub(origin).cross(edge) / denom;
    const u = v1.sub(origin).cross(direction) / denom;

    if (t >= 0 && t <= maxDist && u >= 0 && u <= 1 && t < tMin) {
      tMin = t;
      hitNormal = edge.perpendicular().normalize();
      if (hitNormal.dot(direction) > 0) hitNormal = hitNormal.negate();
    }
  }

  if (tMin === Infinity) return null;
  const point = origin.add(direction.scale(tMin));
  return new RaycastResult(body, point, hitNormal, tMin / maxDist);
}

// ─── Force Generators ───────────────────────────────────────────────────────
export class GravityField {
  constructor(center, strength = 1000, radius = 500) {
    this.center = center;
    this.strength = strength;
    this.radius = radius;
  }
  apply(body) {
    if (body.isStatic) return;
    const diff = this.center.sub(body.position);
    const dist = diff.length();
    if (dist > this.radius || dist < 1e-10) return;
    const falloff = 1 - dist / this.radius;
    const force = diff.normalize().scale(this.strength * falloff * body.mass);
    body.applyForce(force);
  }
}

export class WindField {
  constructor(direction, strength = 100, turbulence = 0.2) {
    this.direction = direction.normalize();
    this.strength = strength;
    this.turbulence = turbulence;
    this._time = 0;
  }
  apply(body, dt) {
    if (body.isStatic) return;
    this._time += dt;
    const turb = 1 + Math.sin(this._time * 5 + body.id) * this.turbulence;
    const force = this.direction.scale(this.strength * turb);
    body.applyForce(force);
  }
}

export class DragField {
  constructor(coefficient = 0.5) {
    this.coefficient = coefficient;
  }
  apply(body) {
    if (body.isStatic) return;
    const speed = body.velocity.length();
    if (speed < 1e-10) return;
    const dragMag = this.coefficient * speed * speed;
    const drag = body.velocity.normalize().scale(-dragMag);
    body.applyForce(drag);
  }
}

export class BuoyancyField {
  constructor(surfaceY = 0, density = 1, linearDrag = 3, angularDrag = 1) {
    this.surfaceY = surfaceY;
    this.density = density;
    this.linearDrag = linearDrag;
    this.angularDrag = angularDrag;
  }
  apply(body) {
    if (body.isStatic) return;
    const aabb = body.getAABB();
    if (aabb.min.y >= this.surfaceY) return;

    const submergedDepth = Math.min(aabb.max.y, this.surfaceY) - aabb.min.y;
    const totalHeight = aabb.max.y - aabb.min.y;
    if (totalHeight < 1e-10) return;
    const submergedFraction = Math.min(1, submergedDepth / totalHeight);

    // Buoyancy force
    const displacedVolume = aabb.area() * submergedFraction;
    const buoyancy = new Vec2(0, -this.density * displacedVolume * 9.81);
    body.applyForce(buoyancy);

    // Drag
    const drag = body.velocity.scale(-this.linearDrag * submergedFraction);
    body.applyForce(drag);
    body.angularVelocity *= (1 - this.angularDrag * submergedFraction * 0.01);
  }
}

// ─── Physics World ──────────────────────────────────────────────────────────
export class PhysicsWorld {
  constructor(opts = {}) {
    this.gravity = opts.gravity || new Vec2(0, 9.81);
    this.bodies = [];
    this.constraints = [];
    this.forceGenerators = [];
    this.spatialHash = new SpatialHash(opts.cellSize || 100);
    this.velocityIterations = opts.velocityIterations || 8;
    this.positionIterations = opts.positionIterations || 3;
    this.enableSleeping = opts.enableSleeping ?? true;
    this._listeners = { collision: [], preSolve: [], postSolve: [], sensorEnter: [], sensorExit: [] };
    this._activeSensors = new Set();
    this._stepCount = 0;
    this._accumulator = 0;
    this._fixedDt = opts.fixedDt || 1/60;
  }

  addBody(body) {
    this.bodies.push(body);
    this.spatialHash.insert(body);
    return body;
  }

  removeBody(body) {
    const idx = this.bodies.indexOf(body);
    if (idx >= 0) {
      this.bodies.splice(idx, 1);
      this.spatialHash.remove(body);
    }
  }

  addConstraint(constraint) {
    this.constraints.push(constraint);
    return constraint;
  }

  removeConstraint(constraint) {
    const idx = this.constraints.indexOf(constraint);
    if (idx >= 0) this.constraints.splice(idx, 1);
  }

  addForceGenerator(gen) {
    this.forceGenerators.push(gen);
    return gen;
  }

  removeForceGenerator(gen) {
    const idx = this.forceGenerators.indexOf(gen);
    if (idx >= 0) this.forceGenerators.splice(idx, 1);
  }

  on(event, cb) {
    if (this._listeners[event]) this._listeners[event].push(cb);
  }

  off(event, cb) {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(cb);
      if (idx >= 0) this._listeners[event].splice(idx, 1);
    }
  }

  _emit(event, data) {
    for (const cb of this._listeners[event]) cb(data);
  }

  step(dt) {
    this._accumulator += dt;
    let steps = 0;
    while (this._accumulator >= this._fixedDt && steps < 4) {
      this._fixedStep(this._fixedDt);
      this._accumulator -= this._fixedDt;
      steps++;
    }
    this._stepCount++;
  }

  _fixedStep(dt) {
    // Apply force generators
    for (const gen of this.forceGenerators) {
      for (const body of this.bodies) {
        gen.apply(body, dt);
      }
    }

    // Integrate forces
    for (const body of this.bodies) {
      body.integrateForces(dt, this.gravity);
    }

    // Solve constraints
    for (let i = 0; i < this.positionIterations; i++) {
      for (const c of this.constraints) c.solve(dt);
    }

    // Broad phase
    for (const body of this.bodies) {
      this.spatialHash.update(body);
    }

    // Narrow phase + resolve
    const pairs = this.spatialHash.getPairs();
    const bodyMap = new Map(this.bodies.map(b => [b.id, b]));

    for (const [idA, idB] of pairs) {
      const a = bodyMap.get(idA);
      const b = bodyMap.get(idB);
      if (!a || !b) continue;
      if (a.isStatic && b.isStatic) continue;
      if (!a.canCollideWith(b)) continue;
      if (a.isSleeping && b.isSleeping) continue;

      const aabb_a = a.getAABB();
      const aabb_b = b.getAABB();
      if (!aabb_a.intersects(aabb_b)) continue;

      const manifold = CollisionDetector.detect(a, b);
      if (!manifold || manifold.contacts.length === 0) continue;

      // Sensor handling
      if (a.isSensor || b.isSensor) {
        const sensorKey = `${a.id}:${b.id}`;
        if (!this._activeSensors.has(sensorKey)) {
          this._activeSensors.add(sensorKey);
          this._emit('sensorEnter', { bodyA: a, bodyB: b });
        }
        continue;
      }

      this._emit('preSolve', manifold);
      CollisionResolver.resolve(manifold);
      this._emit('collision', manifold);
      this._emit('postSolve', manifold);

      a.wake();
      b.wake();
    }

    // Check sensor exits
    for (const key of this._activeSensors) {
      const [idA, idB] = key.split(':').map(Number);
      const a = bodyMap.get(idA);
      const b = bodyMap.get(idB);
      if (!a || !b) { this._activeSensors.delete(key); continue; }
      const aabb_a = a.getAABB();
      const aabb_b = b.getAABB();
      if (!aabb_a.intersects(aabb_b)) {
        this._activeSensors.delete(key);
        this._emit('sensorExit', { bodyA: a, bodyB: b });
      }
    }

    // Integrate velocities
    for (const body of this.bodies) {
      body.integrateVelocity(dt);
    }

    // Sleep
    if (this.enableSleeping) {
      for (const body of this.bodies) {
        body.updateSleep(dt);
      }
    }
  }

  raycast(origin, direction, maxDist = 1000, filter) {
    const results = [];
    const dir = direction.normalize();
    for (const body of this.bodies) {
      if (filter && !filter(body)) continue;
      let result = null;
      if (body.shape.type === ShapeType.CIRCLE) {
        result = raycastCircle(origin, dir, maxDist, body);
      } else if (body.shape.type === ShapeType.POLYGON) {
        result = raycastPolygon(origin, dir, maxDist, body);
      }
      if (result) results.push(result);
    }
    results.sort((a, b) => a.fraction - b.fraction);
    return results;
  }

  queryAABB(aabb) {
    return Array.from(this.spatialHash.query(aabb));
  }

  queryPoint(point) {
    const bodies = this.spatialHash.queryPoint(point);
    const results = [];
    for (const body of bodies) {
      if (body.shape.containsPoint && body.shape.containsPoint(point, body.position, body.angle)) {
        results.push(body);
      }
    }
    return results;
  }

  getBodyById(id) { return this.bodies.find(b => b.id === id) || null; }

  clear() {
    this.bodies = [];
    this.constraints = [];
    this.forceGenerators = [];
    this.spatialHash.clear();
    this._activeSensors.clear();
  }

  getStats() {
    return {
      bodyCount: this.bodies.length,
      constraintCount: this.constraints.length,
      sleepingCount: this.bodies.filter(b => b.isSleeping).length,
      staticCount: this.bodies.filter(b => b.isStatic).length,
      dynamicCount: this.bodies.filter(b => !b.isStatic && !b.isKinematic).length,
      stepCount: this._stepCount,
      totalEnergy: this.bodies.reduce((sum, b) => sum + b.getKineticEnergy(), 0)
    };
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────
export function createBox(x, y, w, h, opts = {}) {
  return new RigidBody(PolygonShape.createBox(w, h), { position: new Vec2(x, y), ...opts });
}

export function createCircle(x, y, r, opts = {}) {
  return new RigidBody(new CircleShape(r), { position: new Vec2(x, y), ...opts });
}

export function createRegularPolygon(x, y, radius, sides, opts = {}) {
  return new RigidBody(PolygonShape.createRegular(radius, sides), { position: new Vec2(x, y), ...opts });
}

export function createStaticEdge(x1, y1, x2, y2) {
  const edge = new EdgeShape(new Vec2(x1, y1), new Vec2(x2, y2));
  return new RigidBody(edge, { isStatic: true });
}

export function createChain(points, opts = {}) {
  const bodies = [];
  const constraints = [];
  for (let i = 0; i < points.length; i++) {
    const body = createCircle(points[i].x, points[i].y, opts.radius || 5, {
      material: opts.material || new Material(),
      isStatic: i === 0 || i === points.length - 1
    });
    bodies.push(body);
    if (i > 0) {
      constraints.push(new DistanceConstraint(bodies[i - 1], body, {
        stiffness: opts.stiffness || 0.9,
        damping: opts.damping || 0.1
      }));
    }
  }
  return { bodies, constraints };
}

export function createSoftBody(center, radius, segments, opts = {}) {
  const bodies = [];
  const constraints = [];
  const mat = opts.material || new Material({ density: 0.5, restitution: 0.3 });

  // Create perimeter
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    bodies.push(createCircle(x, y, opts.nodeRadius || 3, { material: mat }));
  }

  // Create center
  const centerBody = createCircle(center.x, center.y, opts.nodeRadius || 3, { material: mat });
  bodies.push(centerBody);

  const stiffness = opts.stiffness || 0.5;
  const damping = opts.damping || 0.3;

  // Connect perimeter
  for (let i = 0; i < segments; i++) {
    constraints.push(new SpringConstraint(bodies[i], bodies[(i + 1) % segments], { stiffness, damping }));
    constraints.push(new SpringConstraint(bodies[i], centerBody, { stiffness, damping }));
  }

  // Cross-bracing
  for (let i = 0; i < segments; i++) {
    const opposite = (i + Math.floor(segments / 2)) % segments;
    constraints.push(new SpringConstraint(bodies[i], bodies[opposite], { stiffness: stiffness * 0.5, damping }));
  }

  return { bodies, constraints };
}
