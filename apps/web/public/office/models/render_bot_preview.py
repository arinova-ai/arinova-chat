"""Quick Blender preview render of arinova-bot.glb"""
import bpy
import os
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GLB_PATH = os.path.join(SCRIPT_DIR, "arinova-bot.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Import
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

# Find mesh center
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
all_z = []
for obj in meshes:
    for v in obj.data.vertices:
        wc = obj.matrix_world @ v.co
        all_z.append(wc.z)
center_z = (min(all_z) + max(all_z)) / 2 if all_z else 20

# Camera target
bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, center_z))
target = bpy.context.active_object

# 3/4 view camera — pull back for 40-unit-tall model
bpy.ops.object.camera_add(location=(60, -60, 40))
cam = bpy.context.active_object
cam.data.lens = 35
track = cam.constraints.new(type='TRACK_TO')
track.target = target
track.track_axis = 'TRACK_NEGATIVE_Z'
track.up_axis = 'UP_Y'
scene.camera = cam

# Lights
bpy.ops.object.light_add(type='SUN', location=(30, -20, 50))
sun = bpy.context.active_object
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))

bpy.ops.object.light_add(type='AREA', location=(-20, -10, 20))
fill = bpy.context.active_object
fill.data.energy = 80
fill.data.size = 3.0

# Background
world = bpy.data.worlds.new("BG")
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.18, 0.20, 0.25, 1.0)
scene.world = world

# Render
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 800
scene.render.resolution_y = 600

# 3/4 view
out = os.path.join(SCRIPT_DIR, "arinova-bot-preview.png")
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print(f"Preview: {out}")

# Front view
cam.location = (0, -80, center_z)
out2 = os.path.join(SCRIPT_DIR, "arinova-bot-front.png")
scene.render.filepath = out2
bpy.ops.render.render(write_still=True)
print(f"Front: {out2}")
