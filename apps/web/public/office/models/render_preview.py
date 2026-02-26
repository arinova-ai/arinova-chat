"""
Render a preview of arinova-bot.glb from Blender.
Imports the GLB file and renders a turntable-style preview.

Usage:
  blender --background --python render_preview.py
"""

import bpy
import os
import math

# Clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import the GLB
script_dir = os.path.dirname(os.path.abspath(__file__))
glb_path = os.path.join(script_dir, "arinova-bot.glb")
bpy.ops.import_scene.gltf(filepath=glb_path)

# Set up camera
bpy.ops.object.camera_add(location=(1.2, -1.8, 1.0))
cam = bpy.context.active_object
cam.name = "PreviewCam"

# Point camera at model center
constraint = cam.constraints.new(type='TRACK_TO')
# Find the mesh object
target = None
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        target = obj
        break

if target:
    constraint.target = target
    constraint.track_axis = 'TRACK_NEGATIVE_Z'
    constraint.up_axis = 'UP_Y'

bpy.context.scene.camera = cam

# Camera settings
cam.data.lens = 35
cam.data.clip_end = 100

# Add lights
# Key light
bpy.ops.object.light_add(type='SUN', location=(3, -2, 5))
key_light = bpy.context.active_object
key_light.data.energy = 3.0
key_light.rotation_euler = (math.radians(45), math.radians(15), math.radians(30))

# Fill light
bpy.ops.object.light_add(type='AREA', location=(-2, -1, 2))
fill_light = bpy.context.active_object
fill_light.data.energy = 50.0
fill_light.data.size = 3.0

# Rim light
bpy.ops.object.light_add(type='POINT', location=(0, 3, 2.5))
rim_light = bpy.context.active_object
rim_light.data.energy = 100.0

# Background
bpy.context.scene.world = bpy.data.worlds.new("PreviewWorld")
bpy.context.scene.world.use_nodes = True
bg_node = bpy.context.scene.world.node_tree.nodes.get("Background")
bg_node.inputs["Color"].default_value = (0.12, 0.14, 0.18, 1.0)

# Render settings
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.film_transparent = False

# Output
output_path = os.path.join(script_dir, "arinova-bot-preview.png")
scene.render.filepath = output_path
scene.render.image_settings.file_format = 'PNG'

# Render
bpy.ops.render.render(write_still=True)
print(f"\n  Preview rendered: {output_path}\n")
