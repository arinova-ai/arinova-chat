"""
Arinova Robot — Low-poly 3D mascot for Virtual Office
=====================================================
Blender 5.x Python script (headless)

Usage:
  blender --background --python build_arinova_bot.py

Output:
  arinova-bot.glb   (binary glTF, < 5000 tris, Mixamo-ready rig)
  arinova-bot-preview.png  (rendered preview)
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# ──────────────────────────────────────────────────────────
# 0. Scene cleanup
# ──────────────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ──────────────────────────────────────────────────────────
# 1. Materials (PBR metallic-roughness)
# ──────────────────────────────────────────────────────────
def make_mat(name, rgba, roughness=0.55, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

MAT = {
    'blue':      make_mat("Bot_Blue",       (0.231, 0.510, 0.965, 1.0), 0.35),
    'dark_face': make_mat("Bot_DarkFace",   (0.06, 0.09, 0.16, 1.0),   0.4),
    'white':     make_mat("Bot_White",      (0.92, 0.93, 0.95, 1.0),   0.65),
    'logo':      make_mat("Bot_Logo",       (1.0, 1.0, 1.0, 1.0),      0.3),
    'dark':      make_mat("Bot_Dark",       (0.12, 0.12, 0.15, 1.0),   0.5),
    'green':     make_mat("Bot_Green",      (0.133, 0.773, 0.369, 1.0),0.3),
    'hand':      make_mat("Bot_Hand",       (0.40, 0.60, 0.92, 1.0),   0.45),
}


# ──────────────────────────────────────────────────────────
# 2. Mesh helpers
# ──────────────────────────────────────────────────────────
def new_obj(name, mesh_data, mat_key, location=(0,0,0)):
    """Create object, assign material, set location, apply transforms."""
    obj = bpy.data.objects.new(name, mesh_data)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(location)
    if mat_key:
        obj.data.materials.append(MAT[mat_key])
    return obj

def make_box(name, sx, sy, sz, mat_key, loc, bevel=0.04, bseg=2):
    """Rounded box via bmesh."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # Scale
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    # Bevel edges
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=bseg, affect='EDGES')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return new_obj(name, mesh, mat_key, loc)

def make_sphere(name, r, mat_key, loc, seg=10, rings=8):
    """Low-poly UV sphere via bmesh."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return new_obj(name, mesh, mat_key, loc)

def make_cylinder(name, r, depth, mat_key, loc, verts=8):
    """Low-poly cylinder via bmesh."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts,
                          radius1=r, radius2=r, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return new_obj(name, mesh, mat_key, loc)

def make_cone(name, r, depth, mat_key, loc, verts=4):
    """Cone/pyramid via bmesh."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts,
                          radius1=r, radius2=0.0, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = new_obj(name, mesh, mat_key, loc)
    return obj

def make_torus(name, R, r_minor, mat_key, loc, maj_seg=12, min_seg=6):
    """Torus via bmesh."""
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=min_seg, radius=r_minor)
    # Spin to create torus
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.spin(bm, geom=geom, angle=math.radians(360),
                   steps=maj_seg, axis=(0,0,1), cent=(R,0,0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return new_obj(name, mesh, mat_key, loc)


# ──────────────────────────────────────────────────────────
# 3. Build all parts (no parenting — flat structure)
#    All Z-positions carefully tuned so parts overlap/touch.
#
#    Layout (Z from bottom to top):
#      0.00 — ground
#      0.00..0.05  feet
#      0.05..0.25  lower legs
#      0.20..0.42  upper legs (overlap lower by 0.05)
#      0.38..0.68  torso (overlap upper legs by 0.04)
#      0.62..0.74  upper arms (overlap torso sides)
#      0.50..0.62  lower arms (overlap upper arms)
#      0.46..0.50  hands
#      0.65..0.70  neck/collar zone
#      0.68..1.02  head (overlap collar by 0.02)
# ──────────────────────────────────────────────────────────
all_parts = []

# Vertical constants (model before final scale)
# All positions tuned for AGGRESSIVE overlap (≥0.05 units)
# to guarantee seamless joints even with bevel rounding.
FOOT_Z    = 0.025
LLEG_Z    = 0.12    # lowered for foot overlap
ULEG_Z    = 0.27    # lowered for lower-leg overlap
TORSO_Z   = 0.50    # centered, taller torso
COLLAR_Z  = 0.68    # neck bridge zone
HEAD_Z    = 0.80    # lowered to overlap torso top
FACE_Z    = HEAD_Z + 0.02
STATUS_Z  = HEAD_Z + 0.26

ARM_X     = 0.16    # moved inward for shoulder overlap
LEG_X     = 0.07    # slightly inward

UARM_Z    = 0.57    # lowered
LARM_Z    = 0.43    # lowered
HAND_Z    = 0.33    # lowered

# --- HEAD (speech bubble) --- bigger for more overlap
head = make_box("Head", 0.42, 0.38, 0.36, 'blue',
                (0, 0, HEAD_Z), bevel=0.08, bseg=3)
all_parts.append(head)

# Speech bubble tail
tail = make_cone("Tail", 0.06, 0.12, 'blue',
                 (-0.12, 0.14, HEAD_Z - 0.18))
tail.rotation_euler = (math.radians(25), 0, math.radians(-15))
bpy.context.view_layer.objects.active = tail
bpy.ops.object.select_all(action='DESELECT')
tail.select_set(True)
bpy.ops.object.transform_apply(rotation=True)
all_parts.append(tail)

# Face screen (dark inset) — Y pushed to head surface
face = make_box("Face", 0.30, 0.015, 0.20, 'dark_face',
                (0, 0.195, FACE_Z), bevel=0.03, bseg=2)
all_parts.append(face)

# Logo: triangle edges
tri = [
    Vector((0,      0.21, FACE_Z + 0.07)),   # top
    Vector((-0.065, 0.21, FACE_Z - 0.05)),   # bottom-left
    Vector(( 0.065, 0.21, FACE_Z - 0.05)),   # bottom-right
]
for i, (a, b) in enumerate([(0,1),(1,2),(2,0)]):
    pa, pb = tri[a], tri[b]
    mid = (pa + pb) / 2
    length = (pb - pa).length
    direction = (pb - pa).normalized()

    cyl = make_cylinder(f"LogoEdge{i}", 0.008, length, 'logo', mid, verts=6)
    up = Vector((0, 0, 1))
    rot = up.rotation_difference(direction)
    cyl.rotation_euler = rot.to_euler()
    bpy.context.view_layer.objects.active = cyl
    bpy.ops.object.select_all(action='DESELECT')
    cyl.select_set(True)
    bpy.ops.object.transform_apply(rotation=True)
    all_parts.append(cyl)

# Logo: 3 node dots
for i, pos in enumerate(tri):
    node = make_sphere(f"LogoNode{i}", 0.020, 'logo', pos, seg=8, rings=6)
    all_parts.append(node)

# Status indicator
status = make_sphere("StatusDot", 0.032, 'green',
                     (0.18, 0, STATUS_Z), seg=10, rings=8)
all_parts.append(status)

# --- TORSO (white hoodie) --- taller to overlap head bottom & legs top
torso = make_box("Torso", 0.30, 0.22, 0.38, 'white',
                 (0, 0, TORSO_Z), bevel=0.05, bseg=2)
all_parts.append(torso)

# Hood collar — bigger torus to bridge head-torso seam
collar = make_torus("Collar", 0.16, 0.048, 'white',
                    (0, 0, COLLAR_Z))
bpy.context.view_layer.objects.active = collar
bpy.ops.object.select_all(action='DESELECT')
collar.select_set(True)
collar.scale = (1.0, 0.8, 0.5)
bpy.ops.object.transform_apply(scale=True)
all_parts.append(collar)

# Zipper line
zipper = make_box("Zipper", 0.010, 0.004, 0.14, 'dark',
                  (0, 0.115, TORSO_Z), bevel=0.002, bseg=1)
all_parts.append(zipper)

# Pocket
pocket = make_box("Pocket", 0.12, 0.006, 0.04, 'white',
                  (0, 0.115, TORSO_Z - 0.08), bevel=0.006, bseg=1)
all_parts.append(pocket)

# --- ARMS (overlap torso at shoulders) ---
for side, sx in [("L", -1), ("R", 1)]:
    x = sx * ARM_X
    # Shoulder pad — bridges torso edge to upper arm
    shoulder = make_sphere(f"{side}Shoulder", 0.055, 'white',
                           (x * 0.85, 0, UARM_Z + 0.06), seg=8, rings=6)
    # Bigger segments with more overlap
    upper = make_box(f"{side}UpperArm", 0.080, 0.080, 0.20, 'white',
                     (x, 0, UARM_Z), bevel=0.02, bseg=1)
    lower = make_box(f"{side}LowerArm", 0.070, 0.070, 0.18, 'hand',
                     (x, 0, LARM_Z), bevel=0.02, bseg=1)
    hand  = make_sphere(f"{side}Hand", 0.042, 'hand',
                        (x, 0, HAND_Z), seg=8, rings=6)
    all_parts.extend([shoulder, upper, lower, hand])

# --- LEGS (overlap torso at hips) ---
for side, sx in [("L", -1), ("R", 1)]:
    x = sx * LEG_X
    # Taller segments for ≥0.05 overlap
    upper = make_box(f"{side}UpperLeg", 0.090, 0.090, 0.22, 'white',
                     (x, 0, ULEG_Z), bevel=0.02, bseg=1)
    lower = make_box(f"{side}LowerLeg", 0.080, 0.080, 0.22, 'white',
                     (x, 0, LLEG_Z), bevel=0.02, bseg=1)
    foot  = make_box(f"{side}Foot", 0.085, 0.12, 0.06, 'dark',
                     (x, 0.015, FOOT_Z), bevel=0.012, bseg=1)
    all_parts.extend([upper, lower, foot])


# ──────────────────────────────────────────────────────────
# 4. Join all into single mesh
# ──────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='DESELECT')
for obj in all_parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = all_parts[0]
bpy.ops.object.join()

char = bpy.context.active_object
char.name = "ArinovaBot"

# Apply transforms
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Move model so feet sit at Z=0
bbox_min_z = min(v.co.z for v in char.data.vertices)
for v in char.data.vertices:
    v.co.z -= bbox_min_z

# Set origin to center-bottom
char.location = (0, 0, 0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

# Scale to target height 1.7
current_h = max(v.co.z for v in char.data.vertices)
s = 1.7 / current_h
for v in char.data.vertices:
    v.co *= s
char.data.update()


# ──────────────────────────────────────────────────────────
# 5. Humanoid Armature (Mixamo bone names)
# ──────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='DESELECT')

# Calculate scale factor for bone positions
# Original model: feet ~0.47, head top ~1.66
# After scale to 1.7: need to map proportionally
S = s  # reuse scale factor from mesh scaling

bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm_obj = bpy.context.active_object
arm_obj.name = "Armature"
arm_data = arm_obj.data
arm_data.name = "ArinovaBotRig"
arm_data.edit_bones.remove(arm_data.edit_bones[0])

def bone(name, head_pos, tail_pos, parent=None, connect=False):
    b = arm_data.edit_bones.new(name)
    b.head = Vector(head_pos) * S
    b.tail = Vector(tail_pos) * S
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = connect
    return b

# Spine chain (matched to new tighter body layout)
bone("Hips",         (0, 0, 0.38),  (0, 0, 0.44))
bone("Spine",        (0, 0, 0.44),  (0, 0, 0.50),  "Hips", True)
bone("Spine1",       (0, 0, 0.50),  (0, 0, 0.57),  "Spine", True)
bone("Spine2",       (0, 0, 0.57),  (0, 0, 0.65),  "Spine1", True)
bone("Neck",         (0, 0, 0.65),  (0, 0, 0.72),  "Spine2", True)
bone("Head",         (0, 0, 0.72),  (0, 0, 1.00),  "Neck", True)

# Left arm
bone("LeftShoulder", (-0.10, 0, 0.64), (-0.14, 0, 0.64), "Spine2")
bone("LeftArm",      (-0.14, 0, 0.64), (-0.16, 0, 0.50), "LeftShoulder", True)
bone("LeftForeArm",  (-0.16, 0, 0.50), (-0.16, 0, 0.38), "LeftArm", True)
bone("LeftHand",     (-0.16, 0, 0.38), (-0.16, 0, 0.30), "LeftForeArm", True)

# Right arm
bone("RightShoulder",(0.10, 0, 0.64),  (0.14, 0, 0.64),  "Spine2")
bone("RightArm",     (0.14, 0, 0.64),  (0.16, 0, 0.50),  "RightShoulder", True)
bone("RightForeArm", (0.16, 0, 0.50),  (0.16, 0, 0.38),  "RightArm", True)
bone("RightHand",    (0.16, 0, 0.38),  (0.16, 0, 0.30),  "RightForeArm", True)

# Left leg
bone("LeftUpLeg",    (-0.07, 0, 0.38), (-0.07, 0, 0.18), "Hips")
bone("LeftLeg",      (-0.07, 0, 0.18), (-0.07, 0, 0.06), "LeftUpLeg", True)
bone("LeftFoot",     (-0.07, 0, 0.06), (-0.07, 0.06, 0.02),"LeftLeg", True)
bone("LeftToeBase",  (-0.07, 0.06, 0.02),(-0.07, 0.12, 0.02),"LeftFoot", True)

# Right leg
bone("RightUpLeg",   (0.07, 0, 0.38),  (0.07, 0, 0.18),  "Hips")
bone("RightLeg",     (0.07, 0, 0.18),  (0.07, 0, 0.06),  "RightUpLeg", True)
bone("RightFoot",    (0.07, 0, 0.06),  (0.07, 0.06, 0.02),"RightLeg", True)
bone("RightToeBase", (0.07, 0.06, 0.02),(0.07, 0.12, 0.02),"RightFoot", True)

bpy.ops.object.mode_set(mode='OBJECT')

# Parent mesh to armature with automatic weights
bpy.ops.object.select_all(action='DESELECT')
char.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# Rotate to face -Y in Blender (maps to -Z in glTF)
arm_obj.rotation_euler.z = math.radians(180)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


# ──────────────────────────────────────────────────────────
# 6. Stats
# ──────────────────────────────────────────────────────────
tri_count = sum(len(p.vertices) - 2 for p in char.data.polygons)
vert_count = len(char.data.vertices)
height = max(v.co.z for v in char.data.vertices)
print(f"\n{'='*50}")
print(f"  Arinova Bot — Build Complete")
print(f"{'='*50}")
print(f"  Vertices:   {vert_count}")
print(f"  Triangles:  {tri_count}")
print(f"  Materials:  {len(char.data.materials)}")
print(f"  Bones:      {len(arm_data.bones)}")
print(f"  Height:     ~{height:.2f} units")
print(f"{'='*50}\n")


# ──────────────────────────────────────────────────────────
# 7. Export GLB
# ──────────────────────────────────────────────────────────
glb_path = os.path.join(OUTPUT_DIR, "arinova-bot.glb")

bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_animations=False,
    export_skins=True,
    export_materials='EXPORT',
    export_yup=True,
)

print(f"  GLB exported: {glb_path}")
print(f"  File size:    {os.path.getsize(glb_path) / 1024:.1f} KB\n")


# ──────────────────────────────────────────────────────────
# 8. Render preview
# ──────────────────────────────────────────────────────────

# Camera aim target (empty at model center mass)
bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0.85))
cam_target = bpy.context.active_object
cam_target.name = "CamTarget"

# Camera
bpy.ops.object.camera_add(location=(2.2, -2.2, 1.6))
cam = bpy.context.active_object
cam.name = "Cam"
cam.data.lens = 60
cam.data.clip_end = 50

# Track to center of model (not origin at feet)
track = cam.constraints.new(type='TRACK_TO')
track.target = cam_target
track.track_axis = 'TRACK_NEGATIVE_Z'
track.up_axis = 'UP_Y'
scene.camera = cam

# Key light (sun)
bpy.ops.object.light_add(type='SUN', location=(3, -2, 4))
sun = bpy.context.active_object
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))

# Fill light
bpy.ops.object.light_add(type='AREA', location=(-2, -1, 2))
fill = bpy.context.active_object
fill.data.energy = 80
fill.data.size = 3.0

# Rim
bpy.ops.object.light_add(type='POINT', location=(0, 2, 2))
rim = bpy.context.active_object
rim.data.energy = 120

# World background
world = bpy.data.worlds.new("BG")
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.15, 0.17, 0.22, 1.0)
scene.world = world

# Render
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.film_transparent = False

preview_path = os.path.join(OUTPUT_DIR, "arinova-bot-preview.png")
scene.render.filepath = preview_path
scene.render.image_settings.file_format = 'PNG'

# Render 3/4 view (tighter framing)
cam.location = (1.8, -1.8, 1.3)
bpy.ops.render.render(write_still=True)
print(f"  Preview (3/4): {preview_path}")

# Render front view
cam.location = (0, -2.4, 1.0)
front_path = os.path.join(OUTPUT_DIR, "arinova-bot-front.png")
scene.render.filepath = front_path
bpy.ops.render.render(write_still=True)
print(f"  Preview (front): {front_path}")

# Render side view
cam.location = (2.4, 0, 1.0)
side_path = os.path.join(OUTPUT_DIR, "arinova-bot-side.png")
scene.render.filepath = side_path
bpy.ops.render.render(write_still=True)
print(f"  Preview (side): {side_path}\n")
