"""
Arinova Office — Low-poly Furniture Assets
===========================================
Blender 5.x Python script (headless)

Builds 11 office furniture pieces + floor, each exported as
an individual GLB file with Arinova brand PBR materials.

Usage:
  blender --background --python build_furniture.py

Output:
  desk.glb, chair.glb, monitor.glb, bookshelf.glb, couch.glb,
  coffee-table.glb, plant.glb, floor-lamp.glb, rug.glb,
  wall-art.glb, floor.glb
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ──────────────────────────────────────────────────────────
# Arinova brand palette (PBR metallic-roughness)
# ──────────────────────────────────────────────────────────
def srgb(hex_str):
    """Convert hex color to linear RGBA tuple for Blender."""
    h = hex_str.lstrip('#')
    r, g, b = (int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    # sRGB to linear approximation
    def to_lin(c): return ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
    return (to_lin(r), to_lin(g), to_lin(b), 1.0)

COLORS = {
    'navy':       srgb('#0f172a'),
    'blue':       srgb('#3b82f6'),
    'blue_dark':  srgb('#1e40af'),
    'white':      srgb('#f1f5f9'),
    'light_gray': srgb('#cbd5e1'),
    'mid_gray':   srgb('#64748b'),
    'dark_gray':  srgb('#334155'),
    'wood_light': srgb('#d4a574'),
    'wood_dark':  srgb('#8b6f47'),
    'wood_desk':  srgb('#c4956a'),
    'green':      srgb('#22c55e'),
    'green_dark': srgb('#166534'),
    'brown_pot':  srgb('#92400e'),
    'cream':      srgb('#fef3c7'),
    'black':      srgb('#1e1e1e'),
    'screen_off': srgb('#0f172a'),
    'screen_on':  srgb('#bfdbfe'),
    'fabric':     srgb('#475569'),
    'rug_main':   srgb('#dbeafe'),
    'rug_border': srgb('#3b82f6'),
    'canvas':     srgb('#fefce8'),
    'frame':      srgb('#78350f'),
    'floor_tile': srgb('#e2e8f0'),
    'floor_grout':srgb('#94a3b8'),
}


# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────
def reset_scene():
    """Clean scene for next asset."""
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
    """Join parts into single object, set origin to bottom-center."""
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    # Apply transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Move so bottom sits at Z=0
    bbox_min_z = min(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices:
        v.co.z -= bbox_min_z
    obj.location = (0, 0, 0)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj

def export_glb(filename):
    """Export entire scene as GLB."""
    path = os.path.join(OUTPUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_materials='EXPORT',
        export_yup=True,
    )
    size_kb = os.path.getsize(path) / 1024
    # Count tris
    obj = None
    for o in bpy.data.objects:
        if o.type == 'MESH':
            obj = o
            break
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons) if obj else 0
    print(f"  ✓ {filename:24s}  {tris:5d} tris  {size_kb:6.1f} KB")
    return path


# ══════════════════════════════════════════════════════════
# FURNITURE BUILDERS
# ══════════════════════════════════════════════════════════

def build_desk():
    """Office desk: tabletop + 4 legs + drawer panel."""
    reset_scene()
    m_top  = make_mat("DeskTop",  COLORS['wood_desk'], 0.45)
    m_leg  = make_mat("DeskLeg",  COLORS['dark_gray'], 0.3, 0.4)
    m_draw = make_mat("DeskDraw", COLORS['mid_gray'],  0.4, 0.2)

    parts = []
    # Tabletop: 1.2m x 0.6m x 0.04m, at height 0.75m
    parts.append(make_box("Top", 1.2, 0.6, 0.04, m_top, (0, 0, 0.75), bevel=0.01))
    # 4 legs
    for x, y in [(-0.55, -0.25), (0.55, -0.25), (-0.55, 0.25), (0.55, 0.25)]:
        parts.append(make_cylinder(f"Leg", 0.02, 0.73, m_leg, (x, y, 0.365)))
    # Back panel / modesty panel
    parts.append(make_box("Panel", 1.0, 0.02, 0.30, m_draw, (0, -0.24, 0.52), bevel=0.005))
    # Drawer
    parts.append(make_box("Drawer", 0.35, 0.45, 0.12, m_draw, (0.35, 0.0, 0.62), bevel=0.01))
    # Drawer handle
    parts.append(make_box("Handle", 0.08, 0.015, 0.015, m_leg, (0.35, 0.23, 0.62), bevel=0.003))

    join_all(parts, "Desk")
    export_glb("desk.glb")


def build_chair():
    """Office chair: seat + back + 5-star base + stem."""
    reset_scene()
    m_seat = make_mat("Seat",    COLORS['navy'],      0.6)
    m_back = make_mat("Back",    COLORS['navy'],      0.6)
    m_base = make_mat("Base",    COLORS['dark_gray'], 0.3, 0.5)
    m_stem = make_mat("Stem",    COLORS['mid_gray'],  0.3, 0.6)

    parts = []
    # Seat cushion: 0.45 x 0.45 x 0.06
    parts.append(make_box("Seat", 0.45, 0.45, 0.06, m_seat, (0, 0, 0.48), bevel=0.02))
    # Backrest: 0.42 x 0.04 x 0.40
    parts.append(make_box("Backrest", 0.42, 0.04, 0.40, m_back, (0, -0.22, 0.72), bevel=0.02))
    # Stem
    parts.append(make_cylinder("Stem", 0.025, 0.35, m_stem, (0, 0, 0.28)))
    # Base hub
    parts.append(make_cylinder("Hub", 0.04, 0.04, m_base, (0, 0, 0.10)))
    # 5 legs (star pattern)
    for i in range(5):
        angle = math.radians(i * 72)
        ex = math.cos(angle) * 0.25
        ey = math.sin(angle) * 0.25
        # Leg arm
        mid_x = ex / 2
        mid_y = ey / 2
        leg = make_box(f"Arm{i}", 0.25, 0.025, 0.02, m_base,
                       (mid_x, mid_y, 0.08), bevel=0.005)
        # Rotate to point outward
        leg.rotation_euler.z = angle
        bpy.context.view_layer.objects.active = leg
        bpy.ops.object.select_all(action='DESELECT')
        leg.select_set(True)
        bpy.ops.object.transform_apply(rotation=True)
        parts.append(leg)
        # Wheel at tip
        parts.append(make_sphere(f"Wheel{i}", 0.02, m_base,
                                 (ex, ey, 0.02), seg=6, rings=4))

    join_all(parts, "Chair")
    export_glb("chair.glb")


def build_monitor():
    """Computer monitor: screen + bezel + stand + base."""
    reset_scene()
    m_bezel  = make_mat("Bezel",  COLORS['navy'],       0.35, 0.1)
    m_screen = make_mat("Screen", COLORS['screen_on'],   0.2)
    m_stand  = make_mat("Stand",  COLORS['dark_gray'],   0.3, 0.5)

    parts = []
    # Screen bezel: 0.55 x 0.03 x 0.35
    parts.append(make_box("Bezel", 0.55, 0.03, 0.35, m_bezel, (0, 0, 0.40), bevel=0.01))
    # Screen surface (front face)
    parts.append(make_box("Screen", 0.49, 0.005, 0.29, m_screen, (0, 0.018, 0.40), bevel=0.005))
    # Neck
    parts.append(make_cylinder("Neck", 0.02, 0.12, m_stand, (0, -0.02, 0.16)))
    # Base
    parts.append(make_box("Base", 0.22, 0.15, 0.015, m_stand, (0, 0, 0.09), bevel=0.01))

    join_all(parts, "Monitor")
    export_glb("monitor.glb")


def build_bookshelf():
    """Bookshelf: frame + 4 shelves + some books."""
    reset_scene()
    m_frame = make_mat("Frame", COLORS['wood_dark'], 0.5)
    m_shelf = make_mat("Shelf", COLORS['wood_light'], 0.45)
    m_book1 = make_mat("Book1", COLORS['blue'],      0.6)
    m_book2 = make_mat("Book2", COLORS['navy'],      0.6)
    m_book3 = make_mat("Book3", COLORS['cream'],     0.6)

    parts = []
    W, D, H = 0.80, 0.30, 1.60

    # Side panels
    parts.append(make_box("SideL", 0.03, D, H, m_frame, (-W/2, 0, H/2), bevel=0.005))
    parts.append(make_box("SideR", 0.03, D, H, m_frame, ( W/2, 0, H/2), bevel=0.005))
    # Back panel
    parts.append(make_box("Back", W, 0.015, H, m_frame, (0, -D/2+0.01, H/2), bevel=0.003))
    # 4 shelves (bottom, 3 internal, top)
    for i, z in enumerate([0.01, 0.40, 0.80, 1.20, 1.58]):
        parts.append(make_box(f"Shelf{i}", W-0.04, D-0.02, 0.02, m_shelf,
                              (0, 0, z), bevel=0.003))

    # Books on shelves (fewer books to stay < 1000 tris)
    book_mats = [m_book1, m_book2, m_book3]
    for shelf_z in [0.03, 0.42, 0.82]:
        x = -0.24
        for j in range(4):
            bh = 0.22 + (j % 3) * 0.04
            bw = 0.05 + (j % 2) * 0.02
            mat = book_mats[j % len(book_mats)]
            parts.append(make_box(f"Book", bw, 0.20, bh, mat,
                                  (x, 0.02, shelf_z + bh/2), bevel=0.003))
            x += bw + 0.04

    join_all(parts, "Bookshelf")
    export_glb("bookshelf.glb")


def build_couch():
    """Couch/sofa: seat + back + 2 arms + cushions."""
    reset_scene()
    m_body = make_mat("Body",    COLORS['fabric'],    0.75)
    m_cush = make_mat("Cushion", COLORS['mid_gray'],  0.8)
    m_leg  = make_mat("Leg",     COLORS['dark_gray'], 0.3, 0.3)

    parts = []
    # Seat base
    parts.append(make_box("Base", 1.60, 0.70, 0.18, m_body, (0, 0, 0.30), bevel=0.03))
    # Backrest
    parts.append(make_box("Back", 1.60, 0.12, 0.45, m_body, (0, -0.30, 0.54), bevel=0.04))
    # Armrests
    parts.append(make_box("ArmL", 0.10, 0.60, 0.25, m_body, (-0.78, 0, 0.42), bevel=0.03))
    parts.append(make_box("ArmR", 0.10, 0.60, 0.25, m_body, ( 0.78, 0, 0.42), bevel=0.03))
    # Seat cushions (3)
    for i, x in enumerate([-0.46, 0.0, 0.46]):
        parts.append(make_box(f"Cush{i}", 0.44, 0.48, 0.08, m_cush,
                              (x, 0.05, 0.41), bevel=0.02))
    # Back cushions (3)
    for i, x in enumerate([-0.46, 0.0, 0.46]):
        parts.append(make_box(f"BCush{i}", 0.42, 0.08, 0.28, m_cush,
                              (x, -0.22, 0.58), bevel=0.02))
    # 4 small feet
    for x, y in [(-0.65, -0.25), (0.65, -0.25), (-0.65, 0.25), (0.65, 0.25)]:
        parts.append(make_cylinder(f"Foot", 0.025, 0.04, m_leg, (x, y, 0.02)))

    join_all(parts, "Couch")
    export_glb("couch.glb")


def build_coffee_table():
    """Coffee table: round top + 3 legs."""
    reset_scene()
    m_top = make_mat("Top", COLORS['wood_light'], 0.4)
    m_leg = make_mat("Leg", COLORS['dark_gray'],  0.3, 0.4)

    parts = []
    # Round top
    parts.append(make_cylinder("Top", 0.35, 0.03, m_top, (0, 0, 0.42), verts=12))
    # 3 legs
    for i in range(3):
        angle = math.radians(i * 120 + 30)
        x = math.cos(angle) * 0.22
        y = math.sin(angle) * 0.22
        parts.append(make_cylinder(f"Leg{i}", 0.015, 0.40, m_leg, (x, y, 0.20)))

    join_all(parts, "CoffeeTable")
    export_glb("coffee-table.glb")


def build_plant():
    """Potted plant: terracotta pot + soil + foliage."""
    reset_scene()
    m_pot  = make_mat("Pot",    COLORS['brown_pot'],   0.65)
    m_soil = make_mat("Soil",   COLORS['wood_dark'],   0.85)
    m_leaf = make_mat("Leaf",   COLORS['green'],       0.55)
    m_lf2  = make_mat("Leaf2",  COLORS['green_dark'],  0.55)

    parts = []
    # Pot (tapered cylinder)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                          radius1=0.12, radius2=0.09, depth=0.22)
    mesh = bpy.data.meshes.new("Pot")
    bm.to_mesh(mesh); bm.free()
    parts.append(new_obj("Pot", mesh, m_pot, (0, 0, 0.11)))

    # Pot rim
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                          radius1=0.13, radius2=0.13, depth=0.025)
    mesh = bpy.data.meshes.new("Rim")
    bm.to_mesh(mesh); bm.free()
    parts.append(new_obj("Rim", mesh, m_pot, (0, 0, 0.23)))

    # Soil disk
    parts.append(make_cylinder("Soil", 0.10, 0.02, m_soil, (0, 0, 0.21)))

    # Foliage clusters (spheres + cones)
    parts.append(make_sphere("Leaf1", 0.14, m_leaf, (0, 0, 0.42), seg=6, rings=5))
    parts.append(make_sphere("Leaf2", 0.10, m_lf2, (0.08, 0.06, 0.50), seg=6, rings=5))
    parts.append(make_sphere("Leaf3", 0.09, m_leaf, (-0.06, 0.04, 0.52), seg=6, rings=5))
    # Stem
    parts.append(make_cylinder("Stem", 0.012, 0.20, m_lf2, (0, 0, 0.30), verts=5))

    join_all(parts, "Plant")
    export_glb("plant.glb")


def build_floor_lamp():
    """Floor lamp: heavy base + tall stem + shade."""
    reset_scene()
    m_base  = make_mat("Base",  COLORS['dark_gray'],  0.3, 0.4)
    m_stem  = make_mat("Stem",  COLORS['mid_gray'],   0.25, 0.6)
    m_shade = make_mat("Shade", COLORS['cream'],      0.7)
    m_bulb  = make_mat("Bulb",  COLORS['cream'],      0.2, 0.0)

    parts = []
    # Base disk
    parts.append(make_cylinder("Base", 0.15, 0.025, m_base, (0, 0, 0.012), verts=10))
    # Stem
    parts.append(make_cylinder("Stem", 0.012, 1.40, m_stem, (0, 0, 0.72), verts=6))
    # Shade (inverted cone)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8,
                          radius1=0.18, radius2=0.08, depth=0.22)
    mesh = bpy.data.meshes.new("Shade")
    bm.to_mesh(mesh); bm.free()
    parts.append(new_obj("Shade", mesh, m_shade, (0, 0, 1.38)))
    # Bulb glow (small sphere inside shade)
    parts.append(make_sphere("Bulb", 0.03, m_bulb, (0, 0, 1.32), seg=6, rings=4))

    join_all(parts, "FloorLamp")
    export_glb("floor-lamp.glb")


def build_rug():
    """Area rug: flat rectangle with border stripe."""
    reset_scene()
    m_main   = make_mat("Main",   COLORS['rug_main'],   0.85)
    m_border = make_mat("Border", COLORS['rug_border'],  0.8)

    parts = []
    # Main area
    parts.append(make_box("Main", 2.0, 1.4, 0.01, m_main, (0, 0, 0.005), bevel=0.003))
    # Border strips (4 edges)
    bw = 0.06
    parts.append(make_box("BTop",  2.0, bw, 0.012, m_border, (0,  0.70-bw/2, 0.006), bevel=0.002))
    parts.append(make_box("BBot",  2.0, bw, 0.012, m_border, (0, -0.70+bw/2, 0.006), bevel=0.002))
    parts.append(make_box("BLft",  bw, 1.4, 0.012, m_border, (-1.0+bw/2, 0, 0.006), bevel=0.002))
    parts.append(make_box("BRgt",  bw, 1.4, 0.012, m_border, ( 1.0-bw/2, 0, 0.006), bevel=0.002))

    join_all(parts, "Rug")
    export_glb("rug.glb")


def build_wall_art():
    """Wall art: wooden frame + canvas."""
    reset_scene()
    m_frame  = make_mat("Frame",  COLORS['frame'],    0.5)
    m_canvas = make_mat("Canvas", COLORS['canvas'],   0.8)
    m_paint1 = make_mat("Paint1", COLORS['blue'],     0.6)
    m_paint2 = make_mat("Paint2", COLORS['blue_dark'],0.6)

    parts = []
    # Frame border (4 pieces)
    fw = 0.04  # frame width
    W, H = 0.60, 0.45
    parts.append(make_box("FTop", W+fw*2, fw, fw, m_frame, (0, 0,  H/2), bevel=0.005))
    parts.append(make_box("FBot", W+fw*2, fw, fw, m_frame, (0, 0, -H/2), bevel=0.005))
    parts.append(make_box("FLft", fw, fw, H, m_frame, (-W/2-fw/2, 0, 0), bevel=0.005))
    parts.append(make_box("FRgt", fw, fw, H, m_frame, ( W/2+fw/2, 0, 0), bevel=0.005))
    # Canvas background
    parts.append(make_box("Canvas", W, 0.01, H, m_canvas, (0, 0.01, 0), bevel=0.003))
    # Abstract art: a few colored rectangles (Mondrian-ish)
    parts.append(make_box("Art1", 0.20, 0.005, 0.15, m_paint1, (-0.12, 0.02, 0.08), bevel=0.002))
    parts.append(make_box("Art2", 0.14, 0.005, 0.22, m_paint2, (0.15, 0.02, -0.05), bevel=0.002))
    parts.append(make_box("Art3", 0.08, 0.005, 0.08, m_paint1, (0.0, 0.02, -0.12), bevel=0.002))

    obj = join_all(parts, "WallArt")
    # Reposition: origin at bottom-center already done by join_all,
    # but wall art hangs, so we move origin to back-center
    export_glb("wall-art.glb")


def build_floor():
    """Floor tile: 4m x 4m flat plane with subtle grid."""
    reset_scene()
    m_tile  = make_mat("Tile",  COLORS['floor_tile'],  0.65)
    m_grout = make_mat("Grout", COLORS['floor_grout'], 0.8)

    parts = []
    SIZE = 4.0
    # Main floor plane
    parts.append(make_box("Floor", SIZE, SIZE, 0.02, m_tile, (0, 0, 0.01), bevel=0.005))
    # Grid lines (every 1m)
    for i in range(5):
        pos = -2.0 + i * 1.0
        parts.append(make_box(f"GridX{i}", SIZE, 0.01, 0.022, m_grout,
                              (0, pos, 0.011), bevel=0.001))
        parts.append(make_box(f"GridY{i}", 0.01, SIZE, 0.022, m_grout,
                              (pos, 0, 0.011), bevel=0.001))

    join_all(parts, "Floor")
    export_glb("floor.glb")


# ══════════════════════════════════════════════════════════
# BUILD ALL
# ══════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print(f"  Arinova Office Furniture — Build All")
print(f"{'='*60}")
print(f"  {'File':<24s}  {'Tris':>5s}  {'Size':>8s}")
print(f"  {'-'*24}  {'-'*5}  {'-'*8}")

builders = [
    build_desk,
    build_chair,
    build_monitor,
    build_bookshelf,
    build_couch,
    build_coffee_table,
    build_plant,
    build_floor_lamp,
    build_rug,
    build_wall_art,
    build_floor,
]

for builder in builders:
    builder()

print(f"{'='*60}")
print(f"  All assets exported to: {OUTPUT_DIR}")
print(f"{'='*60}\n")
