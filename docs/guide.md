Blender cleanup -> Discovery for quick geometry sanity/concept checks -> Fluent for one repeatable external aero template
Use Discovery to move fast, but treat Fluent as the source of truth for anything you publish.
1. Start In
- Start in Ansys Discovery first if you want the easiest workflow for a beginner: import check, scale/orientation check, quick simplification, and fast qualitative flow previews.
- Move to Ansys Fluent for the final case, final images, and all numbers you put on the website.
- If Discovery struggles with the mesh import, do cleanup in Blender and go straight to Fluent Meshing with a clean STL/OBJ.
- Best default: build one reusable Fluent template, and use Discovery only as a quick pre-check tool.
2. Geometry Prep Rules
Make a separate CFD model, not your website GLB.
Keep:
- Nose, main body, sidepods, floor outline, diffuser, front wing, rear wing, wheels/tires
- Only the major outer surfaces that define the car’s overall aero shape
Simplify or delete:
- Logos, decals, tiny vents, mirrors, antennae, wheel nuts, camera stalks
- Thin winglets, tiny fences, brake duct internals, radiator internals, cockpit internals
- Suspension links unless you want a harder v2 case; for v1, remove them or replace with very simple struts
- Tiny fillets/chamfers and any feature you would barely see in a side profile
Rules before import:
- Use meters
- Apply transforms in Blender
- Put the car centerline on a clean symmetry plane
- Make sure the model is watertight enough for external flow use: no holes, no duplicate faces, no flipped normals, no self-intersections
- Remove all internal cavities you are not explicitly modeling
- Seal cooling openings if you are not doing internal flow
- Avoid zero-thickness sheet surfaces; wings should be real surfaces/bodies, not just visual planes
- Keep wheels as separate bodies if you may try wheel rotation later
Good beginner scale sanity checks for an F1-style car:
- Length about 5.3-5.7 m
- Width about 2.0 m
- Tire outer diameter about 0.70-0.73 m
3. Easiest First External Aero Case
Your first publishable case should be:
- Half-car
- Steady
- External aero
- Single speed
- Single ride height
- No internal cooling
- No transient effects
Recommended first case:
- Inlet speed: 40 m/s as a clean demo speed
- Domain: simple wind-tunnel box around the car
- Use a symmetry plane on vehicle centerline
- Use only one baseline configuration first; compare variants later
Practical domain size to start:
- 2 car lengths upstream
- 4-5 car lengths downstream
- 2 car widths to the side boundary
- 2 car heights to the top boundary
That is usually good enough for a student website demo without wasting too many cells.
4. Recommended First Simulation Settings
My default recommendation for v1:
- Symmetry or full car: use half-car symmetry
- Moving ground or not: use moving ground
- Fixed vs rotating wheels: use fixed wheels first
- Turbulence model: use k-omega SST
- Solver: pressure-based, steady, incompressible air, energy off
Why:
- Half-car is the biggest win for Student limits
- Moving ground helps underbody/downforce realism more than most other easy changes
- Rotating wheels are useful, but not worth the first setup/debug burden
- SST is the safest general-purpose choice for external separated flow on a race-car-like shape
Boundary setup:
- Inlet: velocity inlet
- Outlet: pressure outlet
- Top/sides: symmetry or slip-type farfield treatment
- Center plane: symmetry
- Ground: moving wall at freestream speed, same direction as the flow
- Car surfaces: no-slip wall
Solver workflow:
- Start with first-order if needed just to stabilize
- Switch to second-order for final iterations
- Use force monitors for drag and lift/downforce
- Converge until the force monitors flatten; residuals alone are not enough
Important simplification note:
- Moving ground + fixed wheels is still simplified, but it is a very reasonable website/demo compromise
- If you later want a v2 upgrade, add wheel rotation as a moving wall on the wheel surfaces
5. Mesh Strategy Under Student Limits
Treat the Student limit as your main design constraint. In practice, keep a safe margin and do not build right up to the cap.
Good target budgets:
- Quick check mesh: 150k-220k cells
- Final website mesh: 250k-400k cells
- Try not to go past about 450k so you keep some headroom
Best practical mesh approach:
- Use Fluent Meshing -> Watertight Geometry
- If available and comfortable, use poly-hexcore for the volume mesh
- If not, use a simple tetra core plus inflation layers
Refine locally at:
- Front wing
- Underfloor leading edge
- Diffuser region
- Rear wing
- Around tires and immediate wake
Inflation:
- Use about 6-8 prism/inflation layers
- Growth rate around 1.2
- Do not chase y+ ~ 1 in Student for this project
- For this level, “stable and repeatable” is better than “research-grade near-wall resolution”
6. What To Export For The Website
Export numbers:
- Drag force (N)
- Downforce (N) as -Lift
- Cd
- Cl or clearly labeled Cl_down
- L/D or |Cl|/Cd
- Optionally: body, front wing, rear wing, and wheel force breakdowns if you keep separate wall zones
Export images:
- Static pressure contour on the car surface
- Velocity contour on a center plane
- Streamlines from just ahead of the front wing / underfloor / rear wake
- Pressure contour on the floor/diffuser underside view
- One clean side view and one 3/4 view with the same camera every time
Export data files:
- CSV of force monitors vs iteration
- PNG images at consistent resolution
- One short case summary with speed, mesh count, model simplifications, turbulence model
Very important for coefficients:
- If you run half-car, either use half frontal area as the reference area inside Fluent, or manually double the forces before computing full-car coefficients
- Otherwise your published Cd/Cl can be off by a factor of about 2
For a website, I would show:
- Cd
- Downforce at 40 m/s
- L/D
- 3 to 4 standard images
- A short note like: steady RANS, k-omega SST, simplified half-car, moving ground, fixed wheels, ~350k cells
That reads as honest and credible.
7. Repeatable Workflow For Multiple Car Models
Use this exact loop every time:
1. In Blender, make modelname_cfd_v1
2. Clean and simplify using the same rules
3. Export a clean STL or OBJ in meters
4. Open Discovery for quick scale/orientation/symmetry sanity check
5. Import into the same Fluent template
6. Reuse the same enclosure size ratios
7. Reuse the same boundary names
8. Reuse the same solver settings
9. Reuse the same mesh budget targets
10. Reuse the same reference area method
11. Export the same image set and the same metrics
For fair comparisons across models, keep constant:
- Inlet speed
- Ride height
- Domain size ratios
- Turbulence model
- Mesh strategy
- Reference area definition
- Camera views
- Colorbar ranges when possible
Best template naming:
- body
- front_wing
- rear_wing
- floor
- wheels
- ground
- inlet
- outlet
- top_side
- symmetry
8. Common Mistakes To Avoid
- Importing the website GLB directly without simplification
- Forgetting unit scale and ending up with a tiny or huge car
- Leaving tiny holes, flipped normals, or internal surfaces in the model
- Trying full car + detailed suspension + rotating wheels on your first Student case
- Making the wind tunnel too big and wasting most of your cell budget on empty air
- Using transient / LES / DES for a website demo
- Chasing very fine boundary layers under Student limits
- Publishing coefficients without defining reference area clearly
- Forgetting to double half-car forces for full-car reporting
- Judging convergence only by residuals instead of drag/downforce monitors
- Comparing models with different speeds, mesh densities, or color scales
Best First Publishable Baseline
If you want one safe default to build now, use this:
- Half-car symmetry
- Simplified external shell
- Moving ground
- Fixed wheels
- Steady incompressible Fluent
- k-omega SST
- 40 m/s
- 250k-400k cells
- Pressure contours, velocity slice, streamlines, Cd, downforce, L/D
That is the best simplicity-to-quality tradeoff for an ANSYS Student website portfolio.