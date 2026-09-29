// ==============================================================================
// src/test/fixtures/step-topology-fixtures.ts — STEP ISO 10303-21 Test Fixtures
// ==============================================================================

export const CUBE_EDGES_FIXTURE: Array<[string, string, string]> = [
  ['#E1', '#V1', '#V2'], ['#E2', '#V2', '#V3'], ['#E3', '#V3', '#V4'], ['#E4', '#V4', '#V1'],
  ['#E5', '#V5', '#V6'], ['#E6', '#V6', '#V7'], ['#E7', '#V7', '#V8'], ['#E8', '#V8', '#V5'],
  ['#E9', '#V1', '#V5'], ['#E10', '#V2', '#V6'], ['#E11', '#V3', '#V7'], ['#E12', '#V4', '#V8']
];

export const SYNTHETIC_AP242_STEP = `
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STEP AP242'), '2;1');
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0., 0., 0.));
#2 = CARTESIAN_POINT('', (10., 0., 0.));
#3 = CARTESIAN_POINT('', (10., 10., 0.));
#4 = CARTESIAN_POINT('', (0., 10., 0.));
#10 = VERTEX_POINT('', #1);
#11 = VERTEX_POINT('', #2);
#12 = VERTEX_POINT('', #3);
#13 = VERTEX_POINT('', #4);
#20 = LINE('', #1, #2);
#30 = EDGE_CURVE('', #10, #11, #20, .T.);
#31 = EDGE_CURVE('', #11, #12, #20, .T.);
#32 = EDGE_CURVE('', #12, #13, #20, .T.);
#33 = EDGE_CURVE('', #13, #10, #20, .T.);
#40 = ORIENTED_EDGE('', *, *, #30, .T.);
#41 = ORIENTED_EDGE('', *, *, #31, .T.);
#42 = ORIENTED_EDGE('', *, *, #32, .T.);
#43 = ORIENTED_EDGE('', *, *, #33, .T.);
#44 = ORIENTED_EDGE('', *, *, #30, .F.);
#50 = EDGE_LOOP('', (#40, #41, #42, #43));
#60 = ADVANCED_FACE('', (#50), #1, .T.);
#70 = CLOSED_SHELL('', (#60));
ENDSEC;
END-ISO-10303-21;
`;

export const HYBRID_SEAM_STEP = `
ISO-10303-21;
DATA;
#1 = CARTESIAN_POINT('', (0., 0., 0.));
#2 = CARTESIAN_POINT('', (10., 0., 0.));
#3 = CARTESIAN_POINT('', (5., 10., 0.));
#10 = VERTEX_POINT('', #1);
#11 = VERTEX_POINT('', #2);
#12 = VERTEX_POINT('', #3);
#20 = LINE('', #1, #2);
#30 = EDGE_CURVE('', #10, #11, #20, .T.);
#31 = EDGE_CURVE('', #11, #12, #20, .T.);
#32 = EDGE_CURVE('', #12, #10, #20, .T.);
#40 = ORIENTED_EDGE('', *, *, #30, .T.);
#41 = ORIENTED_EDGE('', *, *, #31, .T.);
#42 = ORIENTED_EDGE('', *, *, #32, .T.);
#50 = EDGE_LOOP('', (#40, #41, #42));
#51 = POLY_LOOP('', (#1, #3, #2));
#52 = FACE_OUTER_BOUND('', #50, .T.);
#53 = FACE_BOUND('', #51, .T.);
#60 = ADVANCED_FACE('', (#52, #53), #1, .T.);
#70 = CLOSED_SHELL('', (#60));
ENDSEC;
END-ISO-10303-21;
`;

export const SYNTHETIC_WATERTIGHT_CUBE_STEP = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STEP AP242'), '2;1');
FILE_NAME('cube.step', '2026-09-29', ('Roman'), ('Test'), 'Preprocessor', 'Origin', 'Auth');
FILE_SCHEMA(('AP242_MANAGED_MODEL_EDITION_PROCESS_DESIGN'));
ENDSEC;
DATA;
#1 = CARTESIAN_POINT('', (0.0, 0.0, 0.0));
#2 = CARTESIAN_POINT('', (10.0, 0.0, 0.0));
#3 = CARTESIAN_POINT('', (10.0, 10.0, 0.0));
#4 = CARTESIAN_POINT('', (0.0, 10.0, 0.0));
#5 = CARTESIAN_POINT('', (0.0, 0.0, 10.0));
#6 = CARTESIAN_POINT('', (10.0, 0.0, 10.0));
#7 = CARTESIAN_POINT('', (10.0, 10.0, 10.0));
#8 = CARTESIAN_POINT('', (0.0, 10.0, 10.0));
#11 = POLY_LOOP('', (#1, #4, #3, #2));
#12 = POLY_LOOP('', (#5, #6, #7, #8));
#13 = POLY_LOOP('', (#1, #2, #6, #5));
#14 = POLY_LOOP('', (#2, #3, #7, #6));
#15 = POLY_LOOP('', (#3, #4, #8, #7));
#16 = POLY_LOOP('', (#4, #1, #5, #8));
#21 = FACE_OUTER_BOUND('', #11, .T.);
#22 = FACE_OUTER_BOUND('', #12, .T.);
#23 = FACE_OUTER_BOUND('', #13, .T.);
#24 = FACE_OUTER_BOUND('', #14, .T.);
#25 = FACE_OUTER_BOUND('', #15, .T.);
#26 = FACE_OUTER_BOUND('', #16, .T.);
#31 = ADVANCED_FACE('', (#21), #100, .T.);
#32 = ADVANCED_FACE('', (#22), #101, .T.);
#33 = ADVANCED_FACE('', (#23), #102, .T.);
#34 = ADVANCED_FACE('', (#24), #103, .T.);
#35 = ADVANCED_FACE('', (#25), #104, .T.);
#36 = ADVANCED_FACE('', (#26), #105, .T.);
#40 = CLOSED_SHELL('', (#31, #32, #33, #34, #35, #36));
#50 = MANIFOLD_SOLID_BREP('', #40);
ENDSEC;
END-ISO-10303-21;
`;
