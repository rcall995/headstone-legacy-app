// Update memorials with photos and epitaphs from scanned headstones
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL = 'https://wsgxvhcdpyrjxyuhlnnw.supabase.co/storage/v1/object/public/scouted-photos/6ff3425c-51b0-4325-8a66-191c1340e2d4/';

// Individual headstone photos (one photo per person/couple)
const individualPhotos = {
  'Eugene L. Belstraz': { photo: '1764369103089-headstone-ixth07.jpg', epitaph: 'In Loving Memory' },
  'Maria O\'Connor': { photo: '1764369105659-headstone-hn84un.jpg' },
  'Edwin Martinez': { photo: '1764452221796-headstone-d76a0f.jpg', epitaph: 'Beloved Father' },
  'Esther E. Murzynowski': { photo: '1764452224373-headstone-vwvy13.jpg' },
  'Ronald M. LaMarco': { photo: '1764452225157-headstone-tpy5co.jpg', epitaph: "Life's journey is not to arrive at the grave in a well preserved body, but rather to skid in sideways, totally worn out, shouting 'Holy Moly What A Ride!'" },
  'James Worley': { photo: '1764452226120-headstone-3o4i71.jpg' },
  'Gloria Mary Worley': { photo: '1764452226120-headstone-3o4i71.jpg' },
  'Ignatius Lazzaro': { photo: '1764452227414-headstone-hnk8go.jpg' },
  'Dorothy Lazzaro': { photo: '1764452227414-headstone-hnk8go.jpg' },
  'Sandra J. Leaming': { photo: '1764452228519-headstone-0gi40b.jpg', epitaph: 'Daughter of Rose Marchetti' },
  'Dorothy D. Hunt': { photo: '1764452229954-headstone-pl67bn.jpg' },
};

// Mausoleum wall photos - map names to wall sections
const mausoleumWall17 = '1764452230788-headstone-v6mn6r.jpg'; // LYN LAMAN, HEYER, KLOCKE, LORD, ROBERTS, LA PRESS, KARL, DLUGOSZ, CRADDOCK, ALLEN, PETRILLA, BUCZYNSKI
const mausoleumWall18 = '1764452231854-headstone-thqw7o.jpg'; // STACK, MARIANI, TURNER, MISSICA, DESEMONE, McNALLY, QUACKENBUSH, SPINNER, AUCLAIR, GERSITZ
const mausoleumWall19 = '1764452232643-headstone-o95mqg.jpg'; // ALDRIDGE, BABISZ, GONDA, JARZYNIECKI, BLICKLEY, BOTA, LONG, TORNABENE, FARKAS
const mausoleumWall20 = '1764452233770-headstone-bj9u1j.jpg'; // RYAN, HOFFER, BARLOW, BLICKLEY, LAMBERT, TORNABENE, GRUBER, KROETSCH
const mausoleumWall21 = '1764452234913-headstone-wo1gxz.jpg'; // QUINN, EBERHARD, PALAMUSO, DE MARTIN, PYC, PODGORNY, POTTS, TSIKALAS, O'CONNOR, SPERRAZZA
const mausoleumWall22 = '1764452236345-headstone-fcuaz9.jpg'; // MATTESON, BIHLER, SAMLAND, GENOVA, CIECHOSKI, BURNS, CLARK, LaMONTE, NESENSOHN, RICCI, GASBARRO
const mausoleumWall23 = '1764452237612-headstone-5o7o5q.jpg'; // LUNDY, BUSH, GILBERT, MRKALL, AVARELLO, BOJAN, WATTS, ROVISON, D'AMICO, KARL
const mausoleumWall24 = '1764452239063-headstone-phmxve.jpg'; // CARROLL, FORTUNE, DEL SIGNORE, BOROWITZ, TORNABENE, SLOVICK
const mausoleumWall25 = '1764452240813-headstone-bkrvxh.jpg'; // SONDEK, LOVELEE, GODWIN, DERNER, SMITH, ELMES, NESBITT, WATSON, DREXELIUS, BRIGGS-RESZUCHA
const mausoleumWall26 = '1764452242263-headstone-1d6a2h.jpg'; // REDDEN, KAZMIERCZAK, BEACH, BEYER, THOMAS, CRAWFORD, ROMA, VALENTI, BRIGGS-RESZUCHA, SOLURI
const mausoleumWall27 = '1764452243548-headstone-2xzupc.jpg'; // PACHTER, O'CONNOR, LEIKER, FRIES, CAPOLUPO, WEISER, FLECKENSTEIN
const mausoleumWall28 = '1764452244989-headstone-g07yd0.jpg'; // FRITSCHI, CARR, MAUL, JIRCITANO, DUTKA, PASCOE, WEISER, BAUER, FAHONEY
const mausoleumWall29 = '1764452246603-headstone-iw027x.jpg'; // WILLIAMS, DeFEO, WAKEFIELD, LORENZ, GOODFELLOW, WILLIAMS, BAKULA, QUACKENBUSH
const mausoleumWall30 = '1764452248432-headstone-80ghi5.jpg'; // PEATE, RUSSELL, KLINE, BAKULA, BECKER, WAGNER, PAGLIEI, DUBIEL, DOMBROWSKI
const mausoleumWall31 = '1764452250205-headstone-mn0egf.jpg'; // QUAGLIANA, GOLDBACH, BURNS, ISENHART, SAMLAND, VAINE, BEYER, ZERNICKEL, ROBINSON, WILLIAMS
const mausoleumWall32 = '1764452252063-headstone-ogi30h.jpg'; // VIOLANTI, MROZIAK, SMITH, McCARTHY, ZERNICKEL, KENNELL, ROBINSON, WIRTH, WILLIAMS, FORSTER

// Map last names to wall photos
const wallMappings = [
  { names: ['Marilyn Mauri Laman', 'Nancy C. Heyer', 'Franklin L. Klocke', 'Mae J. Klocke', 'Shirley A. Lord', 'Herman A. Roberts', 'Annie Nell Roberts', 'Richard F. La Press', 'Claudia L. La Press', 'Bernard Karl', 'Gertrude Karl', 'Andrew M. Dlugosz', 'Michael J. Dlugosz', 'Allan H. Craddock', 'Richard C. Allen', 'Jo Ann Petrilla', 'Stanley R. Buczynski'], photo: mausoleumWall17, epitaphs: { 'Andrew M. Dlugosz': 'Loving Son Brother', 'Michael J. Dlugosz': 'Best Friend' } },
  { names: ['Charles T. Stack', 'Phyllis R. Stack', 'Virginia Mae Mariani', 'Raymond F. Turner', 'Elizabeth Turner', 'Barbara Missica', 'Lawrence J. Desemone', 'Rita M. Desemone', 'William D. McNally', 'John J. Quackenbush Sr.', 'Gertrude Quackenbush', 'Frank J. Spinner', 'Joanne L. Spinner', 'Gerald N. Auclair', 'Elizabeth M. Auclair-Smith', 'John E. Gersitz', 'Judy M. Gersitz'], photo: mausoleumWall18 },
  { names: ['Matthew P. Babisz', 'Dorothy Jourdain-Babisz', 'Anne Gonda', 'Ronald K. Jarzyniecki', 'Helen M. Jarzyniecki', 'Ronald M. Jarzyniecki', 'Phyllis Bota', 'Darryl N. Long', 'Joseph M. Farkas'], photo: mausoleumWall19, epitaphs: { 'Ronald M. Jarzyniecki': 'Loving Son & Brother' } },
  { names: ['Robert F. Hoffer', 'Marcella R. Hoffer', 'John F. Blickley', 'Ruth L. Blickley', 'Harry Andrew Lambert', 'Daniel C. Gruber', 'Beverly J. Kroetsch'], photo: mausoleumWall20 },
  { names: ['Everest E. De Martin', 'Felicia C. De Martin', 'Richard J. Pyc', 'Mary Jane Dudek Pyc', 'Victor J. Podgorny', 'Edward D. Potts', 'John G. Tsikalas', 'Paul J. O\'Connor', 'Charles S. Sperrazza'], photo: mausoleumWall21 },
  { names: ['Norman S. Matteson', 'Bertha A. Matteson', 'Frank H. Bihler', 'Christa A. Bihler', 'Siegfried Samland', 'Anthony Genova', 'Josephine Genova', 'Stanley A. Ciechoski', 'William F. Burns Jr.', 'Eileen S. Mulligan Burns', 'Karen M. Clark', 'Clayton W. Clark', 'John LaMonte', 'Karl H. Nesensohn', 'Ernest R. Gasbarro', 'Elsie D. Gasbarro'], photo: mausoleumWall22 },
  { names: ['Mary E. McDonough Lundy', 'Judith A. Bush', 'Kenneth J. Gilbert', 'Norman J. Mrkall', 'Charlotte Mrkall', 'Fay M. Avarello', 'Harry A. Bojan', 'Antoinette M. Bojan', 'Valerie Annette Watts', 'Holly A. Rovison', 'Robert A. Rovison', 'Martin F. D\'Amico', 'Mary J. D\'Amico', 'John Karl'], photo: mausoleumWall23 },
  { names: ['Henry L. Carroll', 'Lenora L. Carroll', 'Chester Fortune', 'Marguerite Fortune', 'Frank A. Del Signore Sr.', 'Maria P. Del Signore', 'Cecelia Borowitz', 'John J. Tornabene', 'Virginia Tornabene'], photo: mausoleumWall24 },
  { names: ['Shirley M. Sondek', 'Richard K. Lovelee', 'Veronica Godwin', 'Warren C. Derner', 'Helen Derner', 'Robert J. Elmes', 'Clark A. Nesbitt', 'Donald J. Drexelius', 'Jeffery Briggs-Reszucha'], photo: mausoleumWall25 },
  { names: ['Kathleen A. Redden', 'Donald L. Gross', 'Ernest J. Kazmierczak', 'Jacqueline L. Kazmierczak', 'Elizabeth L. Beach', 'Andrew J. Beyer', 'Phyllis J. Beyer', 'Joseph C. Thomas', 'Ann M. Crawford'], photo: mausoleumWall26 },
  { names: ['Richard N. Pachter', 'Betty M. Pachter', 'John V. O\'Connor', 'Evelyn J. O\'Connor'], photo: mausoleumWall27 },
  { names: ['Thomas C. Fritschi Jr.', 'Marcia E. Fritschi', 'Albert Jircitano', 'Iris Landeen Jircitano', 'Walter J. Dutka', 'Sandra Dutka', 'Vincent P. Pascoe', 'Elizabeth A. Pascoe', 'Edward George Weiser Jr.', 'Mildred A. Weiser'], photo: mausoleumWall28 },
  { names: ['Augustine T. Williams', 'Maxine C. Williams', 'Elizabeth Liotti Wakefield', 'John L. Lorenz', 'Wanda M. Lorenz', 'Janice M. Goodfellow', 'Anna E. Williams', 'Robert Edward Bakula'], photo: mausoleumWall29 },
  { names: ['Linda A. Peate', 'Bertram S. Peate', 'Henry I. Russell', 'Diane P. Russell', 'Donald J. Kline', 'Marylouise Kline', 'Edward David Bakula', 'Agnes Theresa Bakula', 'Lee Becker', 'Michael Wayne Wagner', 'Anna May Wagner', 'Lillian A. Pagliei', 'Diane M. Dubiel', 'Lawrence J. Dombrowski'], photo: mausoleumWall30 },
  { names: ['Louis J. Quagliana', 'Mark E. Goldbach', 'Robert M. Goldbach', 'Clarice Samland', 'William Vaine', 'Peter H. Beyer Sr.', 'Madelyn Manganiello'], photo: mausoleumWall31 },
  { names: ['Lana J. Violanti', 'Thomas C. Mroziak', 'Theresa June Smith', 'Gilbert Rupert Smith', 'John A. McCarthy', 'Marlene L. McCarthy', 'Eleanor Zernickel', 'John E. Kennell', 'Martha H. Kennell', 'Earl W. Robinson', 'John G. Wirth Jr.', 'Francis J. Williams Sr.', 'Helen M. Williams', 'Joseph D. Forster'], photo: mausoleumWall32 },
];

async function updateMemorials() {
  console.log('Updating memorials with photos and epitaphs...\n');

  let updatedCount = 0;
  let notFoundCount = 0;

  // Update individual headstone photos
  for (const [name, data] of Object.entries(individualPhotos)) {
    const updateData = { main_photo: BASE_URL + data.photo };
    if (data.epitaph) updateData.title = data.epitaph;

    const { data: result, error } = await supabase
      .from('memorials')
      .update(updateData)
      .eq('name', name)
      .ilike('cemetery_name', '%stephen%')
      .select('id, name');

    if (error) {
      console.error(`Error updating ${name}:`, error.message);
    } else if (result && result.length > 0) {
      console.log(`✓ ${name} - individual photo${data.epitaph ? ' + epitaph' : ''}`);
      updatedCount++;
    } else {
      console.log(`✗ Not found: ${name}`);
      notFoundCount++;
    }
  }

  // Update mausoleum wall photos
  for (const wall of wallMappings) {
    for (const name of wall.names) {
      const updateData = { main_photo: BASE_URL + wall.photo };

      // Check for epitaph
      if (wall.epitaphs && wall.epitaphs[name]) {
        updateData.title = wall.epitaphs[name];
      }

      const { data: result, error } = await supabase
        .from('memorials')
        .update(updateData)
        .eq('name', name)
        .ilike('cemetery_name', '%stephen%')
        .select('id, name');

      if (error) {
        console.error(`Error updating ${name}:`, error.message);
      } else if (result && result.length > 0) {
        console.log(`✓ ${name} - wall photo${updateData.title ? ' + epitaph' : ''}`);
        updatedCount++;
      } else {
        console.log(`✗ Not found: ${name}`);
        notFoundCount++;
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Not found: ${notFoundCount}`);
}

updateMemorials().catch(console.error);
