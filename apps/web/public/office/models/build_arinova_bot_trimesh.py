"""
Arinova Robot — Cute Q-style 3D mascot (trimesh version)
========================================================
Builds a cute, rounded chibi robot matching the Cozy Studio concept art.

Features:
- Large blue screen head with Arinova triangle-nodes logo
- White capsule body
- Simple cylinder arms with blue hands
- Q版 proportions (big head, small body)
- Green status dot
- ~40 world units tall, faces -Z, bottom at Y=0

Usage: python3 build_arinova_bot_trimesh.py
"""

import trimesh
import numpy as np
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "arinova-bot.glb")

# ──────────────────────────────────────────────────────────
# Proportions (Q版: head=38%, body=32%, legs=30%)
# ──────────────────────────────────────────────────────────
H = 40.0
HEAD_H = H * 0.38   # 15.2
BODY_H = H * 0.32   # 12.8
LEG_H  = H * 0.30   # 12.0

HEAD_W = 14.0
HEAD_D = 12.0
BODY_R = 5.0
ARM_R  = 1.8
LEG_R  = 2.0
HAND_R = 2.3

# Y positions (bottom-up, Y=0 at feet)
# Aggressive overlaps to eliminate gaps
FOOT_Y   = 0.0
LEG_TOP  = FOOT_Y + LEG_H                 # 12.0
BODY_BOT = LEG_TOP - 3.5                  # 8.5  (was -2.0)
BODY_TOP = BODY_BOT + BODY_H              # 21.3
HEAD_BOT = BODY_TOP - 3.5                 # 17.8 (was -2.0)
HEAD_TOP = HEAD_BOT + HEAD_H              # 33.0
HEAD_CTR = (HEAD_BOT + HEAD_TOP) / 2      # 25.4
BODY_CTR = (BODY_BOT + BODY_TOP) / 2      # 14.9

# ──────────────────────────────────────────────────────────
# Colors
# ──────────────────────────────────────────────────────────
BLUE        = [55, 120, 240, 255]
WHITE       = [235, 238, 242, 255]
DARK_FACE   = [15, 23, 42, 255]
LOGO_WHITE  = [255, 255, 255, 255]
GREEN       = [34, 197, 94, 255]
HAND_BLUE   = [100, 160, 240, 255]
SHOE_DARK   = [40, 40, 50, 255]
NECK_BLUE   = [70, 130, 220, 255]


# ──────────────────────────────────────────────────────────
# Rotation matrix to make Z-axis cylinders vertical (Y-axis)
# ──────────────────────────────────────────────────────────
ROT_Z_TO_Y = trimesh.transformations.rotation_matrix(
    np.radians(-90), [1, 0, 0]
)

def vert_cylinder(radius, height, pos, color, sections=8):
    """Create a vertical cylinder at position (centered)."""
    cyl = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    cyl.apply_transform(ROT_Z_TO_Y)
    cyl.apply_translation(pos)
    cyl.visual = trimesh.visual.ColorVisuals(
        mesh=cyl, vertex_colors=np.tile(color, (len(cyl.vertices), 1)))
    return cyl

def sphere(radius, pos, color, count=None):
    """Create a sphere at position."""
    if count is None:
        count = [8, 6]
    s = trimesh.creation.uv_sphere(radius=radius, count=count)
    s.apply_translation(pos)
    s.visual = trimesh.visual.ColorVisuals(
        mesh=s, vertex_colors=np.tile(color, (len(s.vertices), 1)))
    return s

def box(extents, pos, color):
    """Create a box at position."""
    b = trimesh.creation.box(extents=extents)
    b.apply_translation(pos)
    b.visual = trimesh.visual.ColorVisuals(
        mesh=b, vertex_colors=np.tile(color, (len(b.vertices), 1)))
    return b


# ──────────────────────────────────────────────────────────
# Build all parts
# ──────────────────────────────────────────────────────────
parts = []

# --- HEAD (blue rounded box) ---
parts.append(('head', box([HEAD_W, HEAD_H, HEAD_D], [0, HEAD_CTR, 0], BLUE)))

# Head corner spheres for roundedness
corner_r = 2.0
for sx in [-1, 1]:
    for sy in [-1, 1]:
        for sz in [-1, 1]:
            cx = sx * (HEAD_W/2 - corner_r)
            cy = HEAD_CTR + sy * (HEAD_H/2 - corner_r)
            cz = sz * (HEAD_D/2 - corner_r)
            parts.append((f'hcorner_{sx}_{sy}_{sz}',
                sphere(corner_r, [cx, cy, cz], BLUE, [6, 4])))

# Speech bubble tail (chat bubble accent)
tail = trimesh.creation.cone(radius=2.0, height=3.5, sections=4)
tail.apply_transform(ROT_Z_TO_Y)
rot_tilt = trimesh.transformations.rotation_matrix(np.radians(20), [0, 0, 1])
tail.apply_transform(rot_tilt)
tail.apply_translation([-HEAD_W/2 + 2, HEAD_BOT - 1.0, HEAD_D/2 - 2])
tail.visual = trimesh.visual.ColorVisuals(
    mesh=tail, vertex_colors=np.tile(BLUE, (len(tail.vertices), 1)))
parts.append(('tail', tail))

# --- FACE SCREEN (dark front panel, slightly inset) ---
face_w, face_h = HEAD_W * 0.72, HEAD_H * 0.58
parts.append(('face', box(
    [face_w, face_h, 0.6],
    [0, HEAD_CTR + 0.5, HEAD_D/2 - 0.15],
    DARK_FACE
)))

# --- LOGO: triangle edges + 3 node dots ---
logo_z = HEAD_D/2 + 0.2
logo_cy = HEAD_CTR + 1.0
ts = 3.5  # triangle size (was 3.2)
tri_pts = [
    np.array([0, logo_cy + ts * 0.6, logo_z]),
    np.array([-ts * 0.5, logo_cy - ts * 0.35, logo_z]),
    np.array([ts * 0.5, logo_cy - ts * 0.35, logo_z]),
]

for i in range(3):
    a, b = tri_pts[i], tri_pts[(i + 1) % 3]
    mid = (a + b) / 2
    length = np.linalg.norm(b - a)
    direction = (b - a) / length

    edge = trimesh.creation.cylinder(radius=0.35, height=length, sections=6)
    z_ax = np.array([0, 0, 1.0])
    cross = np.cross(z_ax, direction)
    cross_len = np.linalg.norm(cross)
    if cross_len > 1e-6:
        cross_n = cross / cross_len
        angle = np.arccos(np.clip(np.dot(z_ax, direction), -1, 1))
        rot_m = trimesh.transformations.rotation_matrix(angle, cross_n)
        edge.apply_transform(rot_m)
    edge.apply_translation(mid)
    edge.visual = trimesh.visual.ColorVisuals(
        mesh=edge, vertex_colors=np.tile(LOGO_WHITE, (len(edge.vertices), 1)))
    parts.append((f'edge{i}', edge))

for i, p in enumerate(tri_pts):
    parts.append((f'node{i}', sphere(0.7, p, LOGO_WHITE, [6, 4])))

# --- STATUS DOT (green, upper right of head) ---
parts.append(('status', sphere(1.2, [HEAD_W/2 - 1, HEAD_TOP - 1.5, HEAD_D/2 - 1], GREEN)))

# --- NECK (blue cylinder bridging head and body) ---
neck_y = (HEAD_BOT + BODY_TOP) / 2
parts.append(('neck', vert_cylinder(
    BODY_R * 0.7, 5.0, [0, neck_y, 0], NECK_BLUE, 8)))

# --- BODY (white capsule = cylinder + 2 sphere caps) ---
body_cyl_h = BODY_H * 0.85  # taller cylinder (was 0.7)
parts.append(('body', vert_cylinder(BODY_R, body_cyl_h, [0, BODY_CTR, 0], WHITE, 10)))
# Body top sphere cap — push up into collar zone
parts.append(('body_top', sphere(BODY_R, [0, BODY_TOP - BODY_R * 0.35, 0], WHITE, [10, 8])))
# Body bottom sphere cap — push down into leg zone
parts.append(('body_bot', sphere(BODY_R, [0, BODY_BOT + BODY_R * 0.35, 0], WHITE, [10, 8])))

# --- COLLAR (blue torus at neck) ---
collar = trimesh.creation.torus(
    major_radius=BODY_R + 0.5, minor_radius=1.2,
    major_sections=10, minor_sections=6)
collar.apply_transform(ROT_Z_TO_Y)
collar.apply_translation([0, BODY_TOP, 0])
collar.visual = trimesh.visual.ColorVisuals(
    mesh=collar, vertex_colors=np.tile(NECK_BLUE, (len(collar.vertices), 1)))
parts.append(('collar', collar))

# --- HIP RING (connects body to legs) ---
hip = trimesh.creation.torus(
    major_radius=BODY_R * 0.8, minor_radius=1.0,
    major_sections=10, minor_sections=6)
hip.apply_transform(ROT_Z_TO_Y)
hip.apply_translation([0, BODY_BOT + 1.0, 0])
hip.visual = trimesh.visual.ColorVisuals(
    mesh=hip, vertex_colors=np.tile(WHITE, (len(hip.vertices), 1)))
parts.append(('hip', hip))

# --- ARMS ---
arm_attach_y = BODY_CTR + 2.5
for label, sx in [("L", -1), ("R", 1)]:
    ax = sx * (BODY_R + ARM_R + 0.3)  # closer to body (was +0.5)

    # Shoulder sphere — bigger, overlaps body
    parts.append((f'shoulder_{label}',
        sphere(ARM_R * 1.8, [ax * 0.75, arm_attach_y + 2.5, 0], WHITE, [8, 6])))

    # Upper arm — starts higher, overlaps shoulder
    uarm_y = arm_attach_y - 0.5
    parts.append((f'uarm_{label}',
        vert_cylinder(ARM_R, 7.5, [ax, uarm_y, 0], WHITE)))

    # Joint sphere between upper and lower arm
    joint_y = uarm_y - 3.5
    parts.append((f'elbow_{label}',
        sphere(ARM_R * 1.1, [ax, joint_y, 0], WHITE, [6, 4])))

    # Lower arm — overlaps joint
    larm_y = joint_y - 2.5
    parts.append((f'larm_{label}',
        vert_cylinder(ARM_R * 0.85, 5.5, [ax, larm_y, 0], HAND_BLUE)))

    # Hand — overlaps lower arm
    hand_y = larm_y - 2.5
    parts.append((f'hand_{label}',
        sphere(HAND_R, [ax, hand_y, 0], HAND_BLUE)))

# --- LEGS ---
leg_x = 3.0
for label, sx in [("L", -1), ("R", 1)]:
    lx = sx * leg_x

    # Hip joint sphere — connects body bottom to leg top
    parts.append((f'hip_{label}',
        sphere(LEG_R * 1.3, [lx, BODY_BOT + 1.5, 0], WHITE, [8, 6])))

    # Upper leg — extends from body bottom down
    uleg_h = LEG_H * 0.5
    uleg_y = BODY_BOT - uleg_h/2 + 2.5  # overlaps into body
    parts.append((f'uleg_{label}',
        vert_cylinder(LEG_R, uleg_h, [lx, uleg_y, 0], WHITE)))

    # Knee joint
    knee_y = uleg_y - uleg_h/2 + 0.5
    parts.append((f'knee_{label}',
        sphere(LEG_R * 1.05, [lx, knee_y, 0], WHITE, [6, 4])))

    # Lower leg — overlaps knee
    lleg_h = LEG_H * 0.45
    lleg_y = knee_y - lleg_h/2 + 0.8
    parts.append((f'lleg_{label}',
        vert_cylinder(LEG_R * 0.85, lleg_h, [lx, lleg_y, 0], WHITE)))

    # Shoe — tall enough to overlap lower leg
    shoe_top = lleg_y - lleg_h/2 + 1.0
    shoe_h = shoe_top + 0.3  # extends to just above Y=0
    parts.append((f'shoe_{label}',
        box([LEG_R * 2.4, max(shoe_h, 2.5), LEG_R * 3.0],
            [lx, shoe_h / 2, 0.5], SHOE_DARK)))


# ──────────────────────────────────────────────────────────
# Assemble & rotate to face -Z
# ──────────────────────────────────────────────────────────
scene = trimesh.Scene()
for name, mesh in parts:
    scene.add_geometry(mesh, node_name=name)

# Face -Z: rotate 180° around Y
rot180 = trimesh.transformations.rotation_matrix(np.radians(180), [0, 1, 0])
for name, geom in scene.geometry.items():
    geom.apply_transform(rot180)

# ──────────────────────────────────────────────────────────
# Export
# ──────────────────────────────────────────────────────────
glb_data = scene.export(file_type='glb')
with open(OUTPUT_PATH, 'wb') as f:
    f.write(glb_data)

fsize = os.path.getsize(OUTPUT_PATH)
tverts = sum(len(m.vertices) for m in scene.geometry.values())
tfaces = sum(len(m.faces) for m in scene.geometry.values())

print(f"\n{'='*50}")
print(f"  Arinova Bot (trimesh) — Build Complete")
print(f"{'='*50}")
print(f"  Parts:      {len(parts)}")
print(f"  Vertices:   {tverts}")
print(f"  Faces:      {tfaces}")
print(f"  Height:     {H} units")
print(f"  File:       {OUTPUT_PATH}")
print(f"  Size:       {fsize / 1024:.1f} KB")
print(f"{'='*50}\n")
