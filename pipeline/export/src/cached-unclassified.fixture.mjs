export const cachedResults = [
  { pointer: "78afe969e625a18a9f20a3280b91064464d974965f7bdf483d8a719b3f43b521/response.body", sha256: "80a16c4395dc56d5eb70ebcdb23a431ea34e7a1653f9221c09aae4e3631a6485", rows: [
    { position: null, driver_number: 77, number_of_laps: 30, points: 0, dnf: true, dns: false, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1252, session_key: 9662 },
    { position: null, driver_number: 43, number_of_laps: 26, points: 0, dnf: true, dns: false, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1252, session_key: 9662 },
    { position: null, driver_number: 11, number_of_laps: 0, points: 0, dnf: true, dns: false, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1252, session_key: 9662 },
  ] },
  { pointer: "2cca0cb61f307a303440d5986f4b01da5f242c44d1956fe8925afd4c318dde41/response.body", sha256: "2c71ff0680f2653a860439a5f5e21d5dc19b3a95fc36ab48b4833d98509b04fb", rows: [
    { position: null, driver_number: 63, number_of_laps: 33, points: 0, dnf: true, dns: false, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1240, session_key: 9558 },
    { position: null, driver_number: 10, number_of_laps: 0, points: 0, dnf: false, dns: true, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1240, session_key: 9558 },
  ] },
  { pointer: "87514e11bc43899f3a957dde1b748663093dd80b60e0bb308ff5b43bb3131eca/response.body", sha256: "2257c86e263b70a24c1cb29173c2f1b9b447f9657bdad04eb352f08748bbf3d7", rows: [
    { position: null, driver_number: 23, number_of_laps: 25, points: 0, dnf: true, dns: false, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1250, session_key: 9644 },
    { position: null, driver_number: 10, number_of_laps: 15, points: 0, dnf: true, dns: false, dsq: false, gap_to_leader: null, duration: null, meeting_key: 1250, session_key: 9644 },
  ] },
];
export const cachedEmptyStints = [
  { pointer: "6b4e832d45f2b5341b243a70cc7a49f91defb7896946f9d8f1c0d505789ad577/response.body", sha256: "33da3e8ef4c01bd46c513862668a3e7eb435e6a58bfb2bd8690ffbcb73be48d2", rows: [
    { meeting_key: 1252, session_key: 9662, stint_number: 1, driver_number: 11, lap_start: null, lap_end: null, compound: "MEDIUM", tyre_age_at_start: 0 },
  ] },
  { pointer: "438475da0a11feae5fe86d9b66875bfc3465ee96f6bd9e2d6e517d1199ade9b3/response.body", sha256: "766ba4af6f1cd7b50e2a7c19626a007b6b003351a824ef73734fc3dc731538b9", rows: [
    { meeting_key: 1240, session_key: 9558, stint_number: 1, driver_number: 10, lap_start: null, lap_end: null, compound: "MEDIUM", tyre_age_at_start: 0 },
  ] },
];
export const cachedUntimedLaps = [
  { pointer: "c1b3c15bc19e2b7878c3716c38fc1a349bbb3fb9f168f2d81c2e88a3526af795/response.body", sha256: "5e078cdfa96999db6a769c6425612a3f1bbfbfad9b86bc47372b19f773ce520f", rows: [
    { meeting_key: 1252, session_key: 9662, driver_number: 11, lap_number: 1, date_start: "2024-12-08T13:03:35.033000+00:00", duration_sector_1: null, duration_sector_2: 50.797, duration_sector_3: null, i1_speed: 283, i2_speed: 128, is_pit_out_lap: false, lap_duration: null, segments_sector_1: [2048,2049,2049,2049,2049], segments_sector_2: [2049,2049,2049,2049,2049,2049,2049,2049,2049], segments_sector_3: [2048,2048,2048,2048,2048,2048,2048,2048,2048], st_speed: 305 },
  ] },
  { pointer: "5ebf7c1f0e1f82655f1baab332cbcd8c85e1fccdbe22ee225493faf25f94e421/response.body", sha256: "fe4b7bd936014ee0bfe10b81fa67a992517367a5945d66db70f6e37f26327371", rows: [
    { meeting_key: 1240, session_key: 9558, driver_number: 10, lap_number: 1, date_start: "2024-07-07T14:03:12.540000+00:00", duration_sector_1: null, duration_sector_2: null, duration_sector_3: null, i1_speed: null, i2_speed: null, is_pit_out_lap: false, lap_duration: null, segments_sector_1: [2048,2048,2048,2048,2048,2048,2048], segments_sector_2: [2048,2048,2048,2048,2048,2048,2048,2048,2048,2048], segments_sector_3: [2048,2048,2048,2048,2048,2064,2064,2064], st_speed: null },
  ] },
];
export const cachedRoot = "/tmp/opencode/f1-release-attempt/continuation/tmp/f1-racing-release-candidates/ca99f6569553/candidate-qm7JId/private/openf1-responses";
export const provenance = "Bounded rows from private cached response bodies in candidate-qm7JId; hashes identify cached bodies, not independently verified original upstream responses.";
