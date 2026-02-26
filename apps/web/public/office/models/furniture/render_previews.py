"""
Render preview images for all furniture GLB assets.
Imports each GLB, sets up camera+lights, renders a 640x480 PNG.

Usage:
  blender --background --python render_previews.py
"""

import bpy
import os
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

ASSETS = [
    ("desk.glb",         (2.0, -2.0, 1.2)),
    ("chair.glb",        (1.2, -1.2, 0.8)),
    ("monitor.glb",      (0.8, -0.8, 0.5)),
    ("bookshelf.glb",    (1.5, 2.5, 1.2)),
    ("couch.glb",        (2.5, -2.0, 1.0)),
    ("coffee-table.glb", (1.0, -1.0, 0.6)),
    ("plant.glb",        (0.8, -0.8, 0.5)),
    ("floor-lamp.glb",   (1.8, -1.8, 1.2)),
    ("rug.glb",          (3.0, -3.0, 2.0)),
    ("wall-art.glb",     (1.0, -1.0, 0.5)),
    ("floor.glb",        (5.0, -5.0, 3.5)),
]


def render_asset(glb_file, cam_pos):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    # Import GLB
    glb_path = os.path.join(SCRIPT_DIR, glb_file)
    if not os.path.exists(glb_path):
        print(f"  SKIP {glb_file} — not found")
        return
    bpy.ops.import_scene.gltf(filepath=glb_path)

    # Find mesh bounds for camera target
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes:
        print(f"  SKIP {glb_file} — no mesh")
        return

    # Calculate center of all meshes
    all_verts_z = []
    for obj in meshes:
        for v in obj.data.vertices:
            world_co = obj.matrix_world @ v.co
            all_verts_z.append(world_co.z)
    center_z = (min(all_verts_z) + max(all_verts_z)) / 2

    # Camera target
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, center_z))
    target = bpy.context.active_object
    target.name = "CamTarget"

    # Camera
    bpy.ops.object.camera_add(location=cam_pos)
    cam = bpy.context.active_object
    cam.data.lens = 50
    cam.data.clip_end = 50
    track = cam.constraints.new(type='TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    scene.camera = cam

    # Lights
    bpy.ops.object.light_add(type='SUN', location=(3, -2, 5))
    sun = bpy.context.active_object
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))

    bpy.ops.object.light_add(type='AREA', location=(-2, -1, 2))
    fill = bpy.context.active_object
    fill.data.energy = 60
    fill.data.size = 3.0

    # Background
    world = bpy.data.worlds.new("BG")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.18, 0.20, 0.25, 1.0)
    scene.world = world

    # Render
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.film_transparent = False

    base = os.path.splitext(glb_file)[0]
    out_path = os.path.join(SCRIPT_DIR, f"preview-{base}.png")
    scene.render.filepath = out_path
    scene.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    print(f"  ✓ preview-{base}.png")


print("\nRendering furniture previews...\n")
for glb, cam in ASSETS:
    render_asset(glb, cam)
print("\nDone!\n")
