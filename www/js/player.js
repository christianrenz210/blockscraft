// First-person player: movement, AABB-vs-voxel collision, swimming and flying.
import * as THREE from 'three';
import { B, IS_SOLID, boxesOf } from './blocks.js';

const HALF_W = 0.3;
const HEIGHT = 1.8;
export const EYE = 1.62;
const GRAVITY = 30;
const JUMP_SPEED = 9;
const WALK = 4.4;
const SPRINT = 6.2;
const FLY = 11;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.headInWater = false;
    this.autoJump = true;
    this.walkDist = 0;
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // Calls fn(minX, minY, minZ, maxX, maxY, maxZ) for every solid block box
  // overlapping the player's box at feet position (x, y, z).
  forEachHit(x, y, z, fn) {
    const w = this.world;
    const ax0 = x - HALF_W, ax1 = x + HALF_W, ay0 = y, ay1 = y + HEIGHT, az0 = z - HALF_W, az1 = z + HALF_W;
    for (let by = Math.floor(ay0); by <= Math.floor(ay1); by++) {
      for (let bz = Math.floor(az0); bz <= Math.floor(az1); bz++) {
        for (let bx = Math.floor(ax0); bx <= Math.floor(ax1); bx++) {
          const id = w.getBlock(bx, by, bz);
          if (!IS_SOLID[id]) continue;
          for (const b of boxesOf(id)) {
            const x0 = bx + b[0], y0 = by + b[1], z0 = bz + b[2], x1 = bx + b[3], y1 = by + b[4], z1 = bz + b[5];
            if (ax1 > x0 && ax0 < x1 && ay1 > y0 && ay0 < y1 && az1 > z0 && az0 < z1) fn(x0, y0, z0, x1, y1, z1);
          }
        }
      }
    }
  }

  // Does the player's box at feet position (x, y, z) overlap any solid block?
  collidesAt(x, y, z) {
    let hit = false;
    this.forEachHit(x, y, z, () => { hit = true; });
    return hit;
  }

  // Would a block at (bx, by, bz) overlap the player?
  intersectsBlock(bx, by, bz) {
    const p = this.pos;
    return (
      p.x + HALF_W > bx && p.x - HALF_W < bx + 1 &&
      p.y + HEIGHT > by && p.y < by + 1 &&
      p.z + HALF_W > bz && p.z - HALF_W < bz + 1
    );
  }

  /**
   * input: { forward, strafe (-1..1), jump, down, sprint }
   */
  update(dt, input) {
    const w = this.world;
    const p = this.pos, v = this.vel;
    const feet = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z));
    this.inWater = feet === B.WATER;
    this.headInWater = w.getBlock(Math.floor(p.x), Math.floor(p.y + EYE), Math.floor(p.z)) === B.WATER;

    // Desired horizontal velocity from input, relative to where we're looking.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let fx = -sin * input.forward + cos * input.strafe;
    let fz = -cos * input.forward - sin * input.strafe;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }

    let speed = this.flying ? FLY : input.sprint ? SPRINT : WALK;
    if (this.inWater && !this.flying) speed *= 0.55;
    const accel = this.flying ? 10 : this.onGround ? 18 : this.inWater ? 8 : 5;
    const k = 1 - Math.exp(-accel * dt);
    v.x += (fx * speed - v.x) * k;
    v.z += (fz * speed - v.z) * k;

    if (this.flying) {
      const vy = (input.jump ? 1 : 0) - (input.down ? 1 : 0);
      v.y += (vy * FLY - v.y) * k;
    } else if (this.inWater) {
      v.y -= GRAVITY * 0.25 * dt;
      if (input.jump) v.y = Math.min(v.y + 30 * dt, 4);
      v.y = Math.max(v.y, -3);
    } else {
      v.y -= GRAVITY * dt;
      if (v.y < -55) v.y = -55;
      if (input.jump && this.onGround) v.y = JUMP_SPEED;
    }

    // Auto-jump onto 1-block steps (handy on touch screens).
    if (this.autoJump && this.onGround && !this.flying && len > 0.1) {
      const ax = p.x + (fx / Math.max(len, 1)) * 0.45, az = p.z + (fz / Math.max(len, 1)) * 0.45;
      if (this.collidesAt(ax, p.y + 0.01, az) && !this.collidesAt(ax, p.y + 1.05, az) &&
          !this.collidesAt(p.x, p.y + 1.05, p.z)) {
        v.y = JUMP_SPEED;
      }
    }

    // Integrate in small steps so fast movement can't tunnel through blocks.
    const maxMove = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
    const steps = Math.max(1, Math.ceil(maxMove / 0.35));
    const sdt = dt / steps;
    this.onGround = false;
    const startX = p.x, startZ = p.z;
    for (let s = 0; s < steps; s++) {
      this.moveAxis(0, v.x * sdt);
      this.moveAxis(2, v.z * sdt);
      this.moveAxis(1, v.y * sdt);
    }
    if (this.onGround && this.flying) this.flying = false;
    if (this.onGround) this.walkDist += Math.hypot(p.x - startX, p.z - startZ);
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.pos;
    if (axis === 0) p.x += amount; else if (axis === 1) p.y += amount; else p.z += amount;

    // Push back out of everything we now overlap, to the nearest valid spot.
    let limit = amount > 0 ? Infinity : -Infinity;
    this.forEachHit(p.x, p.y, p.z, (x0, y0, z0, x1, y1, z1) => {
      if (axis === 0) limit = amount > 0 ? Math.min(limit, x0 - HALF_W - 1e-4) : Math.max(limit, x1 + HALF_W + 1e-4);
      else if (axis === 2) limit = amount > 0 ? Math.min(limit, z0 - HALF_W - 1e-4) : Math.max(limit, z1 + HALF_W + 1e-4);
      else limit = amount > 0 ? Math.min(limit, y0 - HEIGHT - 1e-4) : Math.max(limit, y1);
    });
    if (!Number.isFinite(limit)) return;
    if (axis === 0) { p.x = limit; this.vel.x = 0; }
    else if (axis === 2) { p.z = limit; this.vel.z = 0; }
    else {
      p.y = limit;
      if (amount < 0) this.onGround = true;
      this.vel.y = 0;
    }
  }
}
