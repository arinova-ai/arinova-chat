"""
Cozy Studio Theme — Warm-tone Low-poly Furniture + Room Shell
=============================================================
Blender 5.x Python script (headless)

Builds warm-colored variants of office furniture for the Cozy Studio
theme, plus a room shell (floor + 2 walls + window) as a single GLB.

Usage:
  blender --background --python build_cozy_furniture.py

Color palette: Honey wood, warm cream, amber, soft green, terracotta
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


# ──────────────────────────────────────────────────────────
# Cozy Studio warm palette
# ──────────────────────────────────────────────────────────
def srgb(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    def L(c): return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (L(r), L(g), L(b), 1.0)

C = {
    # Woods
    'wood_honey':   srgb('#c8956c'),   # warm honey wood (desk, shelf)
    'wood_light':   srgb('#deb887'),   # burlywood (floor planks)
    'wood_dark':    srgb('#8b6f47'),   # dark walnut accent
    'wood_leg':     srgb('#a0845c'),   # table/chair legs

    # Walls & surfaces
    'wall_cream':   srgb('#f5f0e8'),   # warm cream wall
    'wall_shadow':  srgb('#e8ddd0'),   # wall in shadow
    'floor_plank':  srgb('#d4a574'),   # floor boards
    'floor_gap':    srgb('#b8906a'),   # floor board gaps

    # Fabrics
    'bean_bag':     srgb('#e8913a'),   # warm amber/orange
    'cushion':      srgb('#d4783a'),   # deeper amber
    'rug_cream':    srgb('#f5ead6'),   # warm cream rug
    'rug_border':   srgb('#c8956c'),   # wood-tone rug border
    'couch_fabric': srgb('#c4a882'),   # warm beige fabric

    # Accents
    'green_leaf':   srgb('#5d9e5a'),   # plant green
    'green_dark':   srgb('#3d7a3a'),   # darker leaf
    'pot_terra':    srgb('#c4713a'),   # terracotta pot
    'pot_soil':     srgb('#6b4832'),   # dark soil

    # Metal / tech
    'metal_warm':   srgb('#8c7e6e'),   # warm gray metal
    'screen_frame': srgb('#5a5048'),   # monitor frame
    'screen_glow':  srgb('#b8d4f0'),   # screen light
    'lamp_shade':   srgb('#f5e6c8'),   # warm shade
    'lamp_glow':    srgb('#fff5e0'),   # warm bulb

    # Books
    'book_amber':   srgb('#d4783a'),
    'book_teal':    srgb('#5a9e8f'),
    'book_cream':   srgb('#f0e4c8'),
    'book_brown':   srgb('#8b6f47'),

    # Window
    'window_frame': srgb('#d4b896'),   # light wood frame
    'window_glass': srgb('#c8dff0'),   # sky blue glass
    'curtain':      srgb('#f0e8d8'),   # sheer curtain
}


# ──────────────────────────────────────────────────────────
# Helpers (same as main furniture builder)
# ──────────────────────────────────────────────────────────
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mat(name, rgba, roughness=0.55, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

def new_obj(name, mesh_data, mat, location=(0,0,0)):
    obj = bpy.data.objects.new(name, mesh_data)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(location)
    if mat:
        obj.data.materials.append(mat)
    return obj

def make_box(name, sx, sy, sz, mat, loc, bevel=0.02, bseg=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx; v.co.y *= sy; v.co.z *= sz
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=bseg, affect='EDGES')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    return new_obj(name, mesh, mat, loc)

def make_cylinder(name, r, depth, mat, loc, verts=8):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts,
                          radius1=r, radius2=r, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    return new_obj(name, mesh, mat, loc)

def make_sphere(name, r, mat, loc, seg=8, rings=6):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    return new_obj(name, mesh, mat, loc)

def make_cone(name, r, depth, mat, loc, verts=8):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts,
                          radius1=r, radius2=0.0, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    return new_obj(name, mesh, mat, loc)

def join_all(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bbox_min_z = min(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices:
        v.co.z -= bbox_min_z
    obj.location = (0, 0, 0)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj

def export_glb(filename):
    path = os.path.join(OUTPUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False,
        export_apply=True, export_animations=False, export_skins=False,
        export_materials='EXPORT', export_yup=True)
    size_kb = os.path.getsize(path) / 1024
    obj = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons) if obj else 0
    print(f"  ✓ {filename:24s}  {tris:5d} tris  {size_kb:6.1f} KB")
    return path


# ══════════════════════════════════════════════════════════
# ROOM SHELL — floor + 2 walls + window opening
# ══════════════════════════════════════════════════════════
def build_room():
    """Room shell: wood floor + back wall + right wall + window."""
    reset_scene()
    m_floor  = make_mat("Floor",     C['floor_plank'], 0.55)
    m_gap    = make_mat("FloorGap",  C['floor_gap'],   0.7)
    m_wall   = make_mat("Wall",      C['wall_cream'],  0.75)
    m_wallsh = make_mat("WallSh",    C['wall_shadow'], 0.75)
    m_wframe = make_mat("WFrame",    C['window_frame'],0.5)
    m_glass  = make_mat("Glass",     C['window_glass'], 0.2, 0.0)
    m_curt   = make_mat("Curtain",   C['curtain'],     0.85)

    parts = []
    # Room dimensions: 6m x 5m
    RW, RD = 6.0, 5.0
    WALL_H = 3.2
    WALL_T = 0.08

    # Floor planks (6 planks along X)
    pw = RW / 7
    for i in range(7):
        x = -RW/2 + pw/2 + i * pw
        parts.append(make_box(f"Plank{i}", pw - 0.02, RD - 0.02, 0.04, m_floor,
                              (x, 0, 0.02), bevel=0.008))
    # Floor gaps
    for i in range(6):
        x = -RW/2 + pw * (i + 1)
        parts.append(make_box(f"Gap{i}", 0.015, RD, 0.042, m_gap,
                              (x, 0, 0.021), bevel=0.001))

    # Back wall (along X, at -Y edge)
    parts.append(make_box("BackWall", RW, WALL_T, WALL_H, m_wall,
                          (0, -RD/2, WALL_H/2), bevel=0.01))

    # Right wall (along Y, at +X edge) — with window cutout
    # Wall below window
    parts.append(make_box("RWallBot", WALL_T, RD, 0.9, m_wallsh,
                          (RW/2, 0, 0.45), bevel=0.01))
    # Wall above window
    parts.append(make_box("RWallTop", WALL_T, RD, 0.5, m_wallsh,
                          (RW/2, 0, WALL_H - 0.25), bevel=0.01))
    # Wall left of window
    parts.append(make_box("RWallL", WALL_T, 0.8, 1.6, m_wallsh,
                          (RW/2, -RD/2 + 0.4, 1.7), bevel=0.01))
    # Wall right of window
    parts.append(make_box("RWallR", WALL_T, 0.8, 1.6, m_wallsh,
                          (RW/2, RD/2 - 0.4, 1.7), bevel=0.01))

    # Window frame
    ww, wh = RD - 1.6, 1.6  # window width x height
    fr = 0.06  # frame thickness
    parts.append(make_box("WinTop", WALL_T+0.02, ww+fr*2, fr, m_wframe,
                          (RW/2, 0, 2.50), bevel=0.005))
    parts.append(make_box("WinBot", WALL_T+0.02, ww+fr*2, fr, m_wframe,
                          (RW/2, 0, 0.90), bevel=0.005))
    parts.append(make_box("WinL", WALL_T+0.02, fr, wh, m_wframe,
                          (RW/2, -ww/2, 1.70), bevel=0.005))
    parts.append(make_box("WinR", WALL_T+0.02, fr, wh, m_wframe,
                          (RW/2, ww/2, 1.70), bevel=0.005))
    # Window cross bar (horizontal middle)
    parts.append(make_box("WinMid", WALL_T+0.02, ww, 0.03, m_wframe,
                          (RW/2, 0, 1.70), bevel=0.003))
    # Glass pane (slightly behind frame)
    parts.append(make_box("Glass", 0.01, ww, wh, m_glass,
                          (RW/2 - 0.03, 0, 1.70), bevel=0.003))

    # Curtain (sheer drape on left side of window)
    parts.append(make_box("CurtainL", 0.02, 0.4, 2.0, m_curt,
                          (RW/2 - 0.06, -ww/2 - 0.1, 1.50), bevel=0.008))
    parts.append(make_box("CurtainR", 0.02, 0.4, 2.0, m_curt,
                          (RW/2 - 0.06, ww/2 + 0.1, 1.50), bevel=0.008))

    # Baseboard
    parts.append(make_box("BaseB", RW, 0.02, 0.08, m_wframe,
                          (0, -RD/2 + 0.05, 0.04), bevel=0.003))
    parts.append(make_box("BaseR", 0.02, RD, 0.08, m_wframe,
                          (RW/2 - 0.05, 0, 0.04), bevel=0.003))

    join_all(parts, "Room")
    export_glb("room.glb")


# ══════════════════════════════════════════════════════════
# FURNITURE — Warm Cozy Variants
# ══════════════════════════════════════════════════════════

def build_desk():
    """Wooden desk — warm honey wood with rounded legs."""
    reset_scene()
    m_top = make_mat("Top", C['wood_honey'], 0.45)
    m_leg = make_mat("Leg", C['wood_leg'],   0.5)
    m_drw = make_mat("Drw", C['wood_dark'],  0.5)

    parts = []
    parts.append(make_box("Top", 1.1, 0.55, 0.04, m_top, (0, 0, 0.72), bevel=0.015))
    for x, y in [(-0.48, -0.22), (0.48, -0.22), (-0.48, 0.22), (0.48, 0.22)]:
        parts.append(make_cylinder(f"Leg", 0.025, 0.70, m_leg, (x, y, 0.35)))
    # Small shelf under desk
    parts.append(make_box("Shelf", 0.40, 0.40, 0.02, m_drw, (0.30, 0, 0.36), bevel=0.008))
    # Drawer
    parts.append(make_box("Drawer", 0.30, 0.40, 0.10, m_drw, (-0.30, 0, 0.60), bevel=0.01))
    parts.append(make_cylinder("Handle", 0.008, 0.06, m_leg, (-0.30, 0.21, 0.60), verts=6))

    join_all(parts, "Desk")
    export_glb("desk.glb")


def build_chair():
    """Wooden chair with cushion seat."""
    reset_scene()
    m_wood = make_mat("Wood",  C['wood_honey'], 0.5)
    m_cush = make_mat("Cush",  C['cushion'],    0.7)

    parts = []
    # Seat (with fabric cushion on top)
    parts.append(make_box("Frame", 0.40, 0.40, 0.03, m_wood, (0, 0, 0.44), bevel=0.01))
    parts.append(make_box("Cushion", 0.36, 0.36, 0.04, m_cush, (0, 0, 0.48), bevel=0.015))
    # Back
    parts.append(make_box("Back", 0.36, 0.03, 0.30, m_wood, (0, -0.19, 0.65), bevel=0.01))
    # 4 legs
    for x, y in [(-0.16, -0.16), (0.16, -0.16), (-0.16, 0.16), (0.16, 0.16)]:
        parts.append(make_cylinder(f"Leg", 0.018, 0.43, m_wood, (x, y, 0.22)))

    join_all(parts, "Chair")
    export_glb("chair.glb")


def build_monitor():
    """Monitor on wooden stand."""
    reset_scene()
    m_frame  = make_mat("Frame",  C['screen_frame'], 0.35, 0.1)
    m_screen = make_mat("Screen", C['screen_glow'],  0.2)
    m_stand  = make_mat("Stand",  C['wood_honey'],   0.5)

    parts = []
    parts.append(make_box("Bezel", 0.50, 0.03, 0.32, m_frame, (0, 0, 0.38), bevel=0.01))
    parts.append(make_box("Screen", 0.44, 0.005, 0.26, m_screen, (0, 0.018, 0.38), bevel=0.005))
    parts.append(make_cylinder("Neck", 0.018, 0.10, m_stand, (0, -0.01, 0.16)))
    parts.append(make_box("Base", 0.20, 0.12, 0.015, m_stand, (0, 0, 0.09), bevel=0.008))

    join_all(parts, "Monitor")
    export_glb("monitor.glb")


def build_bookshelf():
    """Wall-mounted shelf with books."""
    reset_scene()
    m_shelf = make_mat("Shelf", C['wood_honey'], 0.5)
    m_brack = make_mat("Brack", C['wood_dark'],  0.4, 0.2)
    m_b1    = make_mat("B1",    C['book_amber'], 0.6)
    m_b2    = make_mat("B2",    C['book_teal'],  0.6)
    m_b3    = make_mat("B3",    C['book_cream'], 0.6)

    parts = []
    # Two floating shelves
    for i, z in enumerate([1.30, 1.65]):
        parts.append(make_box(f"Shelf{i}", 0.70, 0.20, 0.025, m_shelf,
                              (0, 0, z), bevel=0.005))
        # Brackets
        parts.append(make_box(f"BrL{i}", 0.015, 0.15, 0.08, m_brack,
                              (-0.28, -0.02, z - 0.04), bevel=0.003))
        parts.append(make_box(f"BrR{i}", 0.015, 0.15, 0.08, m_brack,
                              (0.28, -0.02, z - 0.04), bevel=0.003))

    # Books on lower shelf
    bk = [m_b1, m_b2, m_b3, m_b1, m_b2]
    x = -0.22
    for j in range(5):
        bh = 0.18 + (j % 3) * 0.03
        bw = 0.04 + (j % 2) * 0.01
        parts.append(make_box(f"Book{j}", bw, 0.14, bh, bk[j],
                              (x, 0.02, 1.325 + bh/2), bevel=0.003))
        x += bw + 0.025

    # Small plant pot on upper shelf
    m_pot = make_mat("SmPot", C['pot_terra'], 0.65)
    m_leaf = make_mat("SmLeaf", C['green_leaf'], 0.55)
    parts.append(make_cylinder("SmPot", 0.035, 0.06, m_pot, (0.20, 0.02, 1.68), verts=6))
    parts.append(make_sphere("SmLeaf", 0.05, m_leaf, (0.20, 0.02, 1.74), seg=6, rings=4))

    join_all(parts, "Bookshelf")
    export_glb("bookshelf.glb")


def build_bean_bag():
    """Bean bag chair — cozy orange blob."""
    reset_scene()
    m_bag = make_mat("Bag", C['bean_bag'], 0.8)

    parts = []
    # Main body (squashed sphere)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.35)
    for v in bm.verts:
        v.co.z *= 0.55  # squash vertically
        v.co.y *= 0.85  # slightly narrower
    mesh = bpy.data.meshes.new("Bag")
    bm.to_mesh(mesh); bm.free()
    parts.append(new_obj("Bag", mesh, m_bag, (0, 0, 0.18)))

    # Top indent (darker small sphere pushing in)
    m_top = make_mat("BagTop", C['cushion'], 0.85)
    parts.append(make_sphere("Indent", 0.12, m_top, (0, -0.05, 0.32), seg=8, rings=6))

    join_all(parts, "BeanBag")
    export_glb("bean-bag.glb")


def build_plant():
    """Large monstera-style potted plant."""
    reset_scene()
    m_pot  = make_mat("Pot",  C['pot_terra'],  0.65)
    m_soil = make_mat("Soil", C['pot_soil'],   0.85)
    m_leaf = make_mat("Leaf", C['green_leaf'], 0.5)
    m_dk   = make_mat("DkLf", C['green_dark'], 0.5)
    m_stem = make_mat("Stem", C['green_dark'], 0.6)

    parts = []
    # Pot (tapered)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                          radius1=0.16, radius2=0.12, depth=0.30)
    mesh = bpy.data.meshes.new("Pot")
    bm.to_mesh(mesh); bm.free()
    parts.append(new_obj("Pot", mesh, m_pot, (0, 0, 0.15)))

    # Rim
    parts.append(make_cylinder("Rim", 0.17, 0.03, m_pot, (0, 0, 0.31), verts=8))
    # Soil
    parts.append(make_cylinder("Soil", 0.13, 0.02, m_soil, (0, 0, 0.29)))

    # Large leaf clusters (monstera style — overlapping spheres)
    leaves = [
        (( 0.00,  0.00, 0.65), 0.18, m_leaf),
        (( 0.12,  0.08, 0.72), 0.14, m_dk),
        ((-0.10,  0.06, 0.74), 0.12, m_leaf),
        (( 0.06, -0.10, 0.58), 0.13, m_dk),
        ((-0.08, -0.04, 0.68), 0.11, m_leaf),
    ]
    for i, (pos, r, mat) in enumerate(leaves):
        parts.append(make_sphere(f"Leaf{i}", r, mat, pos, seg=7, rings=5))

    # Stems
    parts.append(make_cylinder("Stem1", 0.012, 0.35, m_stem, (0, 0, 0.45), verts=5))
    parts.append(make_cylinder("Stem2", 0.010, 0.30, m_stem, (0.06, 0.04, 0.48), verts=5))

    join_all(parts, "Plant")
    export_glb("plant.glb")


def build_floor_lamp():
    """Floor lamp with warm fabric shade."""
    reset_scene()
    m_base  = make_mat("Base",  C['wood_dark'],  0.5)
    m_stem  = make_mat("Stem",  C['metal_warm'], 0.3, 0.4)
    m_shade = make_mat("Shade", C['lamp_shade'], 0.75)
    m_bulb  = make_mat("Bulb",  C['lamp_glow'],  0.1)

    parts = []
    parts.append(make_cylinder("Base", 0.12, 0.025, m_base, (0, 0, 0.012), verts=8))
    parts.append(make_cylinder("Stem", 0.012, 1.35, m_stem, (0, 0, 0.69), verts=6))
    # Tapered shade
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10,
                          radius1=0.16, radius2=0.10, depth=0.24)
    mesh = bpy.data.meshes.new("Shade")
    bm.to_mesh(mesh); bm.free()
    parts.append(new_obj("Shade", mesh, m_shade, (0, 0, 1.35)))
    parts.append(make_sphere("Bulb", 0.025, m_bulb, (0, 0, 1.28), seg=6, rings=4))

    join_all(parts, "FloorLamp")
    export_glb("floor-lamp.glb")


def build_rug():
    """Warm cream area rug with wood-tone border."""
    reset_scene()
    m_main   = make_mat("Main",   C['rug_cream'],  0.85)
    m_border = make_mat("Border", C['rug_border'], 0.8)

    parts = []
    parts.append(make_box("Main", 2.2, 1.6, 0.01, m_main, (0, 0, 0.005), bevel=0.005))
    bw = 0.06
    parts.append(make_box("BT", 2.2, bw, 0.012, m_border, (0,  0.80-bw/2, 0.006), bevel=0.003))
    parts.append(make_box("BB", 2.2, bw, 0.012, m_border, (0, -0.80+bw/2, 0.006), bevel=0.003))
    parts.append(make_box("BL", bw, 1.6, 0.012, m_border, (-1.10+bw/2, 0, 0.006), bevel=0.003))
    parts.append(make_box("BR", bw, 1.6, 0.012, m_border, ( 1.10-bw/2, 0, 0.006), bevel=0.003))

    join_all(parts, "Rug")
    export_glb("rug.glb")


def build_coffee_table():
    """Small round coffee table — warm wood."""
    reset_scene()
    m_top = make_mat("Top", C['wood_honey'], 0.4)
    m_leg = make_mat("Leg", C['wood_leg'],   0.5)

    parts = []
    parts.append(make_cylinder("Top", 0.30, 0.03, m_top, (0, 0, 0.36), verts=10))
    for i in range(3):
        a = math.radians(i * 120 + 30)
        x, y = math.cos(a) * 0.18, math.sin(a) * 0.18
        parts.append(make_cylinder(f"Leg{i}", 0.015, 0.34, m_leg, (x, y, 0.17)))

    join_all(parts, "CoffeeTable")
    export_glb("coffee-table.glb")


def build_wall_art():
    """Wall art — warm-framed abstract piece."""
    reset_scene()
    m_frame  = make_mat("Frame",  C['wood_dark'],  0.5)
    m_canvas = make_mat("Canvas", C['rug_cream'],  0.8)
    m_p1     = make_mat("P1",     C['book_amber'], 0.6)
    m_p2     = make_mat("P2",     C['book_teal'],  0.6)

    parts = []
    fw = 0.035
    W, H = 0.50, 0.38
    parts.append(make_box("FT", W+fw*2, fw, fw, m_frame, (0, 0,  H/2), bevel=0.004))
    parts.append(make_box("FB", W+fw*2, fw, fw, m_frame, (0, 0, -H/2), bevel=0.004))
    parts.append(make_box("FL", fw, fw, H, m_frame, (-W/2-fw/2, 0, 0), bevel=0.004))
    parts.append(make_box("FR", fw, fw, H, m_frame, ( W/2+fw/2, 0, 0), bevel=0.004))
    parts.append(make_box("Canvas", W, 0.008, H, m_canvas, (0, 0.01, 0), bevel=0.003))
    # Abstract warm blobs
    parts.append(make_sphere("Blob1", 0.08, m_p1, (-0.08, 0.02, 0.04), seg=6, rings=4))
    parts.append(make_sphere("Blob2", 0.06, m_p2, (0.10, 0.02, -0.04), seg=6, rings=4))
    parts.append(make_box("Rect1", 0.12, 0.005, 0.06, m_p1, (0.05, 0.02, 0.10), bevel=0.003))

    join_all(parts, "WallArt")
    export_glb("wall-art.glb")


# ══════════════════════════════════════════════════════════
# BUILD ALL
# ══════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print(f"  Cozy Studio — Warm Furniture Build")
print(f"{'='*60}")
print(f"  {'File':<24s}  {'Tris':>5s}  {'Size':>8s}")
print(f"  {'-'*24}  {'-'*5}  {'-'*8}")

builders = [
    build_room,
    build_desk,
    build_chair,
    build_monitor,
    build_bookshelf,
    build_bean_bag,
    build_plant,
    build_floor_lamp,
    build_rug,
    build_coffee_table,
    build_wall_art,
]

for b in builders:
    b()

print(f"{'='*60}")
print(f"  All cozy assets: {OUTPUT_DIR}")
print(f"{'='*60}\n")
