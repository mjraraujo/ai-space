import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Vec2, Vec3, Mat3, AABB,
  CircleShape, PolygonShape, EdgeShape, ShapeType,
  Material, RigidBody, Contact, Manifold,
  CollisionDetector, CollisionResolver,
  SpatialHash, PhysicsWorld,
  DistanceConstraint, SpringConstraint, RevoluteConstraint, PrismaticConstraint,
  GravityField, WindField, DragField, BuoyancyField,
  RaycastResult, raycastCircle, raycastPolygon,
  createBox, createCircle, createRegularPolygon, createChain, createSoftBody
} from '../physics-engine.js';

describe('Vec2', () => {
  it('creates with defaults', () => {
    const v = new Vec2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('adds vectors', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);
    const result = a.add(b);
    expect(result.x).toBe(4);
    expect(result.y).toBe(6);
  });

  it('subtracts vectors', () => {
    const result = new Vec2(5, 3).sub(new Vec2(2, 1));
    expect(result.x).toBe(3);
    expect(result.y).toBe(2);
  });

  it('scales vector', () => {
    const result = new Vec2(3, 4).scale(2);
    expect(result.x).toBe(6);
    expect(result.y).toBe(8);
  });

  it('computes dot product', () => {
    expect(new Vec2(1, 0).dot(new Vec2(0, 1))).toBe(0);
    expect(new Vec2(2, 3).dot(new Vec2(4, 5))).toBe(23);
  });

  it('computes cross product', () => {
    expect(new Vec2(1, 0).cross(new Vec2(0, 1))).toBe(1);
  });

  it('computes length', () => {
    expect(new Vec2(3, 4).length()).toBe(5);
  });

  it('normalizes', () => {
    const n = new Vec2(3, 4).normalize();
    expect(n.length()).toBeCloseTo(1, 5);
  });

  it('normalizes zero vector', () => {
    const n = new Vec2(0, 0).normalize();
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
  });

  it('rotates', () => {
    const v = new Vec2(1, 0).rotate(Math.PI / 2);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(1, 5);
  });

  it('lerps', () => {
    const result = new Vec2(0, 0).lerp(new Vec2(10, 20), 0.5);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('computes distance', () => {
    expect(new Vec2(0, 0).distanceTo(new Vec2(3, 4))).toBe(5);
  });

  it('gets perpendicular', () => {
    const p = new Vec2(1, 0).perpendicular();
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('negates', () => {
    const n = new Vec2(3, -5).negate();
    expect(n.x).toBe(-3);
    expect(n.y).toBe(5);
  });

  it('checks equality', () => {
    expect(new Vec2(1, 2).equals(new Vec2(1, 2))).toBe(true);
    expect(new Vec2(1, 2).equals(new Vec2(1, 3))).toBe(false);
  });

  it('creates from angle', () => {
    const v = Vec2.fromAngle(0);
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });

  it('clones', () => {
    const a = new Vec2(1, 2);
    const b = a.clone();
    expect(b.x).toBe(1);
    expect(b !== a).toBe(true);
  });

  it('converts to array', () => {
    expect(new Vec2(1, 2).toArray()).toEqual([1, 2]);
  });
});

describe('Vec3', () => {
  it('creates with defaults', () => {
    const v = new Vec3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('adds', () => {
    const r = new Vec3(1, 2, 3).add(new Vec3(4, 5, 6));
    expect(r.x).toBe(5);
    expect(r.y).toBe(7);
    expect(r.z).toBe(9);
  });

  it('cross product', () => {
    const r = new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0));
    expect(r.z).toBe(1);
  });

  it('normalizes', () => {
    expect(new Vec3(0, 3, 4).normalize().length()).toBeCloseTo(1, 5);
  });

  it('static helpers', () => {
    expect(Vec3.up().y).toBe(1);
    expect(Vec3.right().x).toBe(1);
    expect(Vec3.forward().z).toBe(1);
  });
});

describe('Mat3', () => {
  it('creates identity', () => {
    const m = Mat3.identity();
    expect(m.m[0]).toBe(1);
    expect(m.m[4]).toBe(1);
    expect(m.m[8]).toBe(1);
  });

  it('multiplies identity', () => {
    const a = Mat3.identity();
    const b = Mat3.rotation(0.5);
    const r = a.multiply(b);
    expect(r.m[0]).toBeCloseTo(b.m[0], 5);
  });

  it('transforms vector', () => {
    const t = Mat3.translation(10, 20);
    const v = t.transformVec2(new Vec2(0, 0));
    expect(v.x).toBe(10);
    expect(v.y).toBe(20);
  });

  it('computes determinant', () => {
    expect(Mat3.identity().determinant()).toBe(1);
  });

  it('inverts', () => {
    const m = Mat3.scale(2, 3);
    const inv = m.inverse();
    expect(inv).not.toBeNull();
    expect(inv.m[0]).toBeCloseTo(0.5, 5);
  });

  it('transposes', () => {
    const m = new Mat3([1,2,3, 4,5,6, 7,8,9]);
    const t = m.transpose();
    expect(t.m[1]).toBe(4);
    expect(t.m[3]).toBe(2);
  });
});

describe('AABB', () => {
  it('computes properties', () => {
    const aabb = new AABB(new Vec2(0, 0), new Vec2(10, 20));
    expect(aabb.width).toBe(10);
    expect(aabb.height).toBe(20);
    expect(aabb.center.x).toBe(5);
    expect(aabb.area()).toBe(200);
  });

  it('checks containment', () => {
    const aabb = new AABB(new Vec2(0, 0), new Vec2(10, 10));
    expect(aabb.contains(new Vec2(5, 5))).toBe(true);
    expect(aabb.contains(new Vec2(15, 5))).toBe(false);
  });

  it('checks intersection', () => {
    const a = new AABB(new Vec2(0, 0), new Vec2(10, 10));
    const b = new AABB(new Vec2(5, 5), new Vec2(15, 15));
    const c = new AABB(new Vec2(20, 20), new Vec2(30, 30));
    expect(a.intersects(b)).toBe(true);
    expect(a.intersects(c)).toBe(false);
  });

  it('merges', () => {
    const merged = new AABB(new Vec2(0, 0), new Vec2(5, 5))
      .merge(new AABB(new Vec2(3, 3), new Vec2(10, 10)));
    expect(merged.min.x).toBe(0);
    expect(merged.max.x).toBe(10);
  });

  it('creates from circle', () => {
    const aabb = AABB.fromCircle(new Vec2(5, 5), 3);
    expect(aabb.min.x).toBe(2);
    expect(aabb.max.x).toBe(8);
  });

  it('creates from points', () => {
    const aabb = AABB.fromPoints([new Vec2(1, 2), new Vec2(5, 8), new Vec2(3, 1)]);
    expect(aabb.min.x).toBe(1);
    expect(aabb.max.y).toBe(8);
  });
});

describe('Shapes', () => {
  it('creates circle shape', () => {
    const s = new CircleShape(5);
    expect(s.type).toBe(ShapeType.CIRCLE);
    expect(s.radius).toBe(5);
  });

  it('circle computes AABB', () => {
    const s = new CircleShape(5);
    const aabb = s.computeAABB(new Vec2(10, 10), 0);
    expect(aabb.min.x).toBe(5);
    expect(aabb.max.x).toBe(15);
  });

  it('circle computes mass', () => {
    const s = new CircleShape(5);
    const m = s.computeMass(1);
    expect(m.mass).toBeCloseTo(Math.PI * 25, 1);
  });

  it('circle contains point', () => {
    const s = new CircleShape(5);
    expect(s.containsPoint(new Vec2(3, 0), new Vec2(0, 0), 0)).toBe(true);
    expect(s.containsPoint(new Vec2(10, 0), new Vec2(0, 0), 0)).toBe(false);
  });

  it('creates polygon from box', () => {
    const s = PolygonShape.createBox(10, 20);
    expect(s.type).toBe(ShapeType.POLYGON);
    expect(s.vertices.length).toBe(4);
    expect(s.normals.length).toBe(4);
  });

  it('polygon requires 3+ vertices', () => {
    expect(() => new PolygonShape([new Vec2(0,0), new Vec2(1,1)])).toThrow();
  });

  it('creates regular polygon', () => {
    const s = PolygonShape.createRegular(10, 6);
    expect(s.vertices.length).toBe(6);
  });

  it('polygon computes mass', () => {
    const s = PolygonShape.createBox(10, 10);
    const m = s.computeMass(1);
    expect(m.mass).toBeGreaterThan(0);
  });

  it('creates edge shape', () => {
    const e = new EdgeShape(new Vec2(0, 0), new Vec2(10, 0));
    expect(e.type).toBe(ShapeType.EDGE);
    expect(e.getLength()).toBe(10);
    expect(e.computeMass(1).mass).toBe(0);
  });
});

describe('Material', () => {
  it('creates with defaults', () => {
    const m = new Material();
    expect(m.density).toBe(1);
    expect(m.restitution).toBe(0.3);
  });

  it('has presets', () => {
    expect(Material.steel().density).toBe(7.8);
    expect(Material.rubber().restitution).toBe(0.8);
    expect(Material.ice().friction).toBe(0.02);
    expect(Material.bouncy().restitution).toBe(0.95);
  });
});

describe('RigidBody', () => {
  it('creates dynamic body', () => {
    const b = new RigidBody(new CircleShape(5));
    expect(b.mass).toBeGreaterThan(0);
    expect(b.isStatic).toBe(false);
    expect(b.invMass).toBeGreaterThan(0);
  });

  it('creates static body', () => {
    const b = new RigidBody(new CircleShape(5), { isStatic: true });
    expect(b.mass).toBe(0);
    expect(b.invMass).toBe(0);
  });

  it('applies force', () => {
    const b = new RigidBody(new CircleShape(5));
    b.applyForce(new Vec2(10, 0));
    expect(b.force.x).toBe(10);
  });

  it('applies impulse', () => {
    const b = new RigidBody(new CircleShape(5));
    const origVel = b.velocity.clone();
    b.applyImpulse(new Vec2(100, 0));
    expect(b.velocity.x).toBeGreaterThan(origVel.x);
  });

  it('integrates forces and velocity', () => {
    const b = new RigidBody(new CircleShape(5), { position: new Vec2(0, 0) });
    b.applyForce(new Vec2(100, 0));
    b.integrateForces(1/60, new Vec2(0, 0));
    b.integrateVelocity(1/60);
    expect(b.position.x).toBeGreaterThan(0);
  });

  it('computes kinetic energy', () => {
    const b = new RigidBody(new CircleShape(5));
    b.velocity = new Vec2(10, 0);
    expect(b.getKineticEnergy()).toBeGreaterThan(0);
  });

  it('manages sleep', () => {
    const b = new RigidBody(new CircleShape(5));
    b.sleep();
    expect(b.isSleeping).toBe(true);
    b.wake();
    expect(b.isSleeping).toBe(false);
  });

  it('checks collision filtering', () => {
    const a = new RigidBody(new CircleShape(5), { category: 0x01, mask: 0x02 });
    const b = new RigidBody(new CircleShape(5), { category: 0x02, mask: 0x01 });
    const c = new RigidBody(new CircleShape(5), { category: 0x04, mask: 0x04 });
    expect(a.canCollideWith(b)).toBe(true);
    expect(a.canCollideWith(c)).toBe(false);
  });

  it('gets AABB', () => {
    const b = new RigidBody(new CircleShape(5), { position: new Vec2(10, 10) });
    const aabb = b.getAABB();
    expect(aabb.min.x).toBe(5);
    expect(aabb.max.x).toBe(15);
  });
});

describe('CollisionDetector', () => {
  it('detects circle vs circle', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(8, 0, 5);
    const m = CollisionDetector.circleVsCircle(a, b);
    expect(m).not.toBeNull();
    expect(m.contacts.length).toBeGreaterThan(0);
    expect(m.depth).toBeCloseTo(2, 1);
  });

  it('no collision for separated circles', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(20, 0, 5);
    expect(CollisionDetector.circleVsCircle(a, b)).toBeNull();
  });

  it('detects polygon vs polygon', () => {
    const a = createBox(0, 0, 10, 10);
    const b = createBox(8, 0, 10, 10);
    const m = CollisionDetector.polygonVsPolygon(a, b);
    expect(m).not.toBeNull();
  });

  it('no collision for separated polygons', () => {
    const a = createBox(0, 0, 10, 10);
    const b = createBox(20, 0, 10, 10);
    expect(CollisionDetector.polygonVsPolygon(a, b)).toBeNull();
  });

  it('uses detect() dispatcher', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(8, 0, 5);
    const m = CollisionDetector.detect(a, b);
    expect(m).not.toBeNull();
  });
});

describe('SpatialHash', () => {
  it('inserts and queries', () => {
    const hash = new SpatialHash(50);
    const body = createCircle(25, 25, 5);
    hash.insert(body);
    const result = hash.query(new AABB(new Vec2(0, 0), new Vec2(50, 50)));
    expect(result.size).toBe(1);
  });

  it('removes bodies', () => {
    const hash = new SpatialHash(50);
    const body = createCircle(25, 25, 5);
    hash.insert(body);
    hash.remove(body);
    const result = hash.query(new AABB(new Vec2(0, 0), new Vec2(50, 50)));
    expect(result.size).toBe(0);
  });

  it('gets pairs', () => {
    const hash = new SpatialHash(50);
    hash.insert(createCircle(10, 10, 5));
    hash.insert(createCircle(15, 15, 5));
    const pairs = hash.getPairs();
    expect(pairs.length).toBe(1);
  });

  it('clears', () => {
    const hash = new SpatialHash(50);
    hash.insert(createCircle(0, 0, 5));
    hash.clear();
    expect(hash.cells.size).toBe(0);
  });
});

describe('PhysicsWorld', () => {
  let world;

  beforeEach(() => {
    world = new PhysicsWorld({ gravity: new Vec2(0, 100) });
  });

  it('adds and removes bodies', () => {
    const body = createCircle(0, 0, 5);
    world.addBody(body);
    expect(world.bodies.length).toBe(1);
    world.removeBody(body);
    expect(world.bodies.length).toBe(0);
  });

  it('steps simulation', () => {
    const body = createCircle(0, 0, 5);
    world.addBody(body);
    world.step(1/60);
    expect(body.position.y).toBeGreaterThan(0);
  });

  it('handles collisions', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(8, 0, 5);
    world.addBody(a);
    world.addBody(b);

    const collisions = [];
    world.on('collision', m => collisions.push(m));
    world.step(1/60);
    expect(collisions.length).toBeGreaterThan(0);
  });

  it('adds constraints', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(50, 0, 5);
    world.addBody(a);
    world.addBody(b);
    const c = world.addConstraint(new DistanceConstraint(a, b));
    expect(world.constraints.length).toBe(1);
    world.removeConstraint(c);
    expect(world.constraints.length).toBe(0);
  });

  it('adds force generators', () => {
    const wind = world.addForceGenerator(new WindField(new Vec2(1, 0), 50));
    expect(world.forceGenerators.length).toBe(1);
    world.removeForceGenerator(wind);
    expect(world.forceGenerators.length).toBe(0);
  });

  it('raycasts', () => {
    const body = createCircle(50, 0, 10);
    world.addBody(body);
    const results = world.raycast(new Vec2(0, 0), new Vec2(1, 0), 100);
    expect(results.length).toBe(1);
    expect(results[0].body).toBe(body);
  });

  it('queries AABB', () => {
    world.addBody(createCircle(25, 25, 5));
    world.addBody(createCircle(100, 100, 5));
    // Need to update spatial hash
    world.step(0);
    const results = world.queryAABB(new AABB(new Vec2(0, 0), new Vec2(50, 50)));
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('clears', () => {
    world.addBody(createCircle(0, 0, 5));
    world.clear();
    expect(world.bodies.length).toBe(0);
  });

  it('gets stats', () => {
    world.addBody(createCircle(0, 0, 5));
    world.addBody(createBox(0, 100, 200, 10, { isStatic: true }));
    const stats = world.getStats();
    expect(stats.bodyCount).toBe(2);
    expect(stats.staticCount).toBe(1);
  });

  it('handles sensor events', () => {
    const sensor = createCircle(0, 0, 20, { isSensor: true });
    const body = createCircle(5, 0, 5);
    world.addBody(sensor);
    world.addBody(body);

    const enters = [];
    world.on('sensorEnter', data => enters.push(data));
    world.step(1/60);
    expect(enters.length).toBeGreaterThan(0);
  });
});

describe('Constraints', () => {
  it('distance constraint', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(100, 0, 5);
    const c = new DistanceConstraint(a, b, { distance: 50 });
    c.solve(1/60);
    // Bodies should be pulled together
    expect(a.position.distanceTo(b.position)).toBeLessThan(100);
  });

  it('spring constraint applies force', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(100, 0, 5);
    const spring = new SpringConstraint(a, b, { restLength: 50, stiffness: 100 });
    spring.solve(1/60);
    expect(a.force.x).toBeGreaterThan(0);
  });

  it('revolute constraint', () => {
    const a = createCircle(0, 0, 5);
    const b = createCircle(10, 0, 5);
    const rev = new RevoluteConstraint(a, b, { enableLimits: true, lowerAngle: -0.5, upperAngle: 0.5 });
    rev.solve(1/60);
    // Should not throw
    expect(rev.enableLimits).toBe(true);
  });

  it('prismatic constraint', () => {
    const a = createCircle(0, 0, 5, { isStatic: true });
    const b = createCircle(50, 50, 5);
    const p = new PrismaticConstraint(a, b, { axis: new Vec2(1, 0) });
    p.solve(1/60);
    expect(p.axis.x).toBeCloseTo(1, 5);
  });
});

describe('Force Generators', () => {
  it('gravity field attracts', () => {
    const body = createCircle(50, 0, 5);
    const field = new GravityField(new Vec2(0, 0), 1000, 100);
    field.apply(body);
    expect(body.force.x).toBeLessThan(0);
  });

  it('wind field applies force', () => {
    const body = createCircle(0, 0, 5);
    const wind = new WindField(new Vec2(1, 0), 100);
    wind.apply(body, 1/60);
    expect(body.force.x).toBeGreaterThan(0);
  });

  it('drag field slows', () => {
    const body = createCircle(0, 0, 5);
    body.velocity = new Vec2(100, 0);
    const drag = new DragField(0.5);
    drag.apply(body);
    expect(body.force.x).toBeLessThan(0);
  });

  it('buoyancy field applies upward force', () => {
    const body = createCircle(0, -5, 10);
    const buoy = new BuoyancyField(0, 1);
    buoy.apply(body);
    expect(body.force.y).toBeLessThan(0); // Upward
  });
});

describe('Factory Functions', () => {
  it('createBox', () => {
    const b = createBox(10, 20, 30, 40);
    expect(b.shape.type).toBe(ShapeType.POLYGON);
    expect(b.position.x).toBe(10);
  });

  it('createCircle', () => {
    const c = createCircle(5, 10, 15);
    expect(c.shape.type).toBe(ShapeType.CIRCLE);
    expect(c.shape.radius).toBe(15);
  });

  it('createRegularPolygon', () => {
    const p = createRegularPolygon(0, 0, 10, 6);
    expect(p.shape.vertices.length).toBe(6);
  });

  it('createChain', () => {
    const points = [new Vec2(0, 0), new Vec2(20, 0), new Vec2(40, 0)];
    const chain = createChain(points);
    expect(chain.bodies.length).toBe(3);
    expect(chain.constraints.length).toBe(2);
  });

  it('createSoftBody', () => {
    const soft = createSoftBody(new Vec2(0, 0), 50, 8);
    expect(soft.bodies.length).toBe(9); // 8 perimeter + 1 center
    expect(soft.constraints.length).toBeGreaterThan(8);
  });
});
