// Enrich Forest Lawn famous people memorials with historical data
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const memorials = [
  {
    name: 'Millard Fillmore',
    title: '13th President of the United States',
    birth_date: '1800-01-07',
    death_date: '1874-03-08',
    birth_place: 'Locke Township (now Moravia), New York',
    death_place: 'Buffalo, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Millard_Fillmore_by_Brady_Studio_1855-65-crop.jpg',
    bio: `Millard Fillmore was the 13th President of the United States, serving from 1850 to 1853 after the death of President Zachary Taylor. He was the last Whig president and the last president who was neither a Democrat nor a Republican.

Born in a log cabin to a poor family in the Finger Lakes region of New York, Fillmore received little formal education until age 18. He was apprenticed to a wool carder at 15 before pursuing law, being admitted to the bar in 1823. His law practice flourished in East Aurora and then Buffalo, which he made his permanent home in 1830.

Fillmore served in the New York State Assembly and U.S. House of Representatives before being elected Vice President in 1848. As President, he signed the Compromise of 1850 and opened trade with Japan through Commodore Perry's expedition.

After leaving office, he helped establish the University at Buffalo (serving as its first chancellor), the Buffalo Historical Society, the Buffalo Fine Arts Society, and the Grosvenor Library. He married Abigail Powers in 1826, and they had two children. After her death in 1853, he married Caroline McIntosh in 1858.

Fillmore died in Buffalo on March 8, 1874, after suffering a stroke. A statue of Fillmore stands outside Buffalo City Hall, and a ceremony is held at his grave every January 7th.`
  },
  {
    name: 'William Fargo',
    title: 'Co-founder of Wells Fargo & American Express',
    birth_date: '1818-05-20',
    death_date: '1881-08-03',
    birth_place: 'Pompey, New York',
    death_place: 'Buffalo, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/c/c4/William_George_Fargo_%28portrait%29.jpg',
    bio: `William George Fargo was an American businessman and politician who co-founded two of America's most iconic companies: Wells Fargo and American Express.

Born the eldest of twelve children, Fargo left school at age 13 to carry mail and help support his family. In 1841, he became a freight agent for the Auburn and Syracuse Railroad. In 1845, along with Henry Wells and Daniel Dunning, he organized the Western Express running from Buffalo to Cincinnati, St. Louis, and Chicago.

In 1850, Fargo helped consolidate three competing express companies into the American Express Company, with Wells as President and Fargo as Secretary. He later became President of American Express in 1866.

In 1852, when other American Express directors objected to expansion to California, Wells and Fargo created Wells Fargo & Co. to serve the Gold Rush market. The company offered banking services including buying gold and selling bank drafts, plus rapid express delivery throughout the West.

Fargo also served two terms as Democratic Mayor of Buffalo from 1862 to 1866. He married Anna H. Williams in 1840.

Fargo Avenue in Buffalo, the Fargo Quadrangle at the University at Buffalo, and the city of Fargo, North Dakota are all named in his honor.`
  },
  {
    name: 'Rick James',
    title: 'Legendary Funk Musician - "Super Freak"',
    birth_date: '1948-02-01',
    death_date: '2004-08-06',
    birth_place: 'Buffalo, New York',
    death_place: 'Burbank, California',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/1/17/Rick_James_1984.jpg',
    bio: `Rick James, born James Ambrose Johnson Jr., was an American singer, songwriter, and record producer who became one of the most influential funk musicians of the late 20th century.

Born and raised in Buffalo, he was the third of eight children raised in a strict Catholic household. He grew up in the Perry and Willert Park Projects before moving to the Cold Springs section of the city. Music was in his blood—his uncle was Melvin Franklin, bass vocalist of The Temptations.

James started singing on street corners and in the choir at St. Bridget's Roman Catholic Church, where he also served as an altar boy. He attended Bennett High School before dropping out as a teenager, eventually fleeing to Canada to avoid the Vietnam War draft.

After forming the Stone City Band in Buffalo in 1977, James found success with Motown's Gordy Records. His 1978 debut album "Come Get It!" produced hits "You and I" and "Mary Jane." His 1981 album "Street Songs" featuring "Super Freak" and "Give It to Me Baby" sold over four million copies and crossed over to mainstream audiences.

MC Hammer's 1990 hit "U Can't Touch This" sampled "Super Freak," earning James his only Grammy Award. Despite personal struggles, his influence on funk, R&B, and hip-hop remains immeasurable.`
  },
  {
    name: 'Shirley Chisholm',
    title: 'First Black Woman Elected to U.S. Congress',
    birth_date: '1924-11-30',
    death_date: '2005-01-01',
    birth_place: 'Brooklyn, New York',
    death_place: 'Ormond Beach, Florida',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Shirley_Chisholm.jpg',
    bio: `Shirley Anita Chisholm was an American politician, educator, and author who broke numerous barriers in American politics. In 1968, she became the first Black woman elected to the United States Congress.

Born in Brooklyn to immigrant parents from Barbados, Chisholm spent ages 3 to 10 with her grandmother in Barbados before returning to New York. She graduated from Brooklyn College in 1946, where she became known for her debate skills, and earned a master's degree in elementary education from Columbia University in 1952.

Chisholm began her career as a nursery school teacher before entering politics. In 1964, she became the second African American in the New York State Legislature. In 1968, she won election to Congress representing Brooklyn's 12th district, serving seven terms until 1983.

Her campaign slogan "Unbought and Unbossed" reflected her independent spirit. She was a founding member of the Congressional Black Caucus and, in 1972, became the first Black candidate and first woman to seek a major party's presidential nomination.

After Congress, she taught at Mount Holyoke College and Spelman College, and co-founded the National Political Congress of Black Women. She was posthumously awarded the Presidential Medal of Freedom in 2015.`
  },
  {
    name: 'Willis Carrier',
    title: 'Father of Modern Air Conditioning',
    birth_date: '1876-11-26',
    death_date: '1950-10-07',
    birth_place: 'Angola, New York',
    death_place: 'New York City, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Willis_Carrier_1915.jpg',
    bio: `Willis Haviland Carrier was an American engineer who invented modern air conditioning, fundamentally changing how humans live, work, and build.

Born on a dairy farm just outside Buffalo in Angola, New York, he was his parents' only child. He attended Angola Academy and taught school before entering Central High School in Buffalo to meet college requirements. In 1901, he graduated from Cornell University with a degree in Mechanical Engineering.

After graduation, Carrier joined Buffalo Forge Company. On July 17, 1902, responding to humidity problems at a Brooklyn printing company, he submitted drawings for what became recognized as the world's first modern air conditioning system. His invention controlled both temperature and humidity, making possible everything from modern hospitals to computer data centers.

In 1915, Carrier and six fellow engineers pooled $32,600 to form the Carrier Engineering Corporation. The company grew to become the world's largest manufacturer of air conditioning systems.

Carrier was awarded an honorary engineering degree from Lehigh University in 1935 and a Doctor of Letters from Alfred University in 1942. He received the Frank P. Brown Medal in 1942 and was posthumously inducted into the National Inventors Hall of Fame in 1985.

Time magazine named him one of the 100 Most Influential People of the 20th Century in 1998.`
  },
  {
    name: 'Red Jacket (Sagoyewatha)',
    title: 'Legendary Seneca Chief & Orator',
    birth_date: '1750-01-01',
    death_date: '1830-01-20',
    birth_place: 'Seneca Nation, New York',
    death_place: 'Buffalo Creek Reservation, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Red_Jacket_by_Charles_Bird_King.jpg',
    bio: `Red Jacket, known as Otetiani ("Always Ready") in his youth and Sagoyewatha ("He Keeps Them Awake") as an adult chief, was one of the most influential Native American leaders and orators in American history.

A member of the Wolf clan of the Seneca tribe—the largest of the six Iroquois nations—Red Jacket gained his English name from the succession of red coats he wore while allied with the British during the American Revolution.

Red Jacket became famous as a marvellously articulate spokesman for Iroquois culture and values during a time when his people faced intense pressure from white settlers and institutions. He was a powerful defender of his native religion and became an outspoken opponent of Christian missionaries seeking to convert his people.

During the War of 1812, the Seneca allied with the United States, and Red Jacket fought bravely in several battles. Despite personal struggles with alcohol in his later years that led to his temporary removal as chief in 1827, he was reinstated following personal reform and intervention by the U.S. Office of Indian Affairs.

Red Jacket died of cholera on January 20, 1830, on the Buffalo Creek Reservation. In 1884, his remains were reinterred at Forest Lawn Cemetery, and the Buffalo Historical Society erected a memorial statue in 1890. His eloquent defense of native rights and religious freedom continues to inspire.`
  },
  {
    name: 'Lawrence Dale Bell',
    title: 'Founder of Bell Aircraft Corporation',
    birth_date: '1894-04-05',
    death_date: '1956-10-20',
    birth_place: 'Mentone, Indiana',
    death_place: 'Buffalo, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Lawrence_Dale_Bell.jpg',
    bio: `Lawrence Dale "Larry" Bell was an American industrialist and aviation pioneer who founded Bell Aircraft Corporation, which produced some of the most significant aircraft in aviation history.

Born in Mentone, Indiana, Bell's family moved to Santa Monica, California, in 1907. He entered aviation in 1912 as a mechanic with his brother Grover and stunt pilot Lincoln Beachey. After his brother's death in a plane crash, Bell briefly left aviation before friends convinced him to return.

Bell joined Glenn L. Martin Company, becoming shop foreman at age 20 and eventually general manager. In 1928, he joined Consolidated Aircraft in Buffalo, rising to vice president. When Consolidated relocated to San Diego in 1935, Bell stayed in Buffalo and founded Bell Aircraft Corporation with 56 employees.

Bell Aircraft built the P-39 Airacobra and P-63 Kingcobra fighters during World War II. The company's P-59 Airacomet was America's first jet-powered aircraft, and the Bell X-1 became the first aircraft to break the sound barrier in level flight in 1947, piloted by Chuck Yeager.

Bell also pioneered helicopter development. The Bell 47 became the first helicopter certified for civilian use, with over 5,600 built.

For his contributions, Bell shared the 1947 Collier Trophy with Yeager and was posthumously inducted into the National Aviation Hall of Fame.`
  },
  {
    name: 'Mary Burnett Talbert',
    title: 'Civil Rights Pioneer & NAACP Leader',
    birth_date: '1866-09-17',
    death_date: '1923-10-15',
    birth_place: 'Oberlin, Ohio',
    death_place: 'Buffalo, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/Mary_Burnett_Talbert_-_NARA_-_559179.jpg',
    bio: `Mary Burnett Talbert was an American orator, activist, suffragist, and reformer who played a pivotal role in the early civil rights movement and the founding of the NAACP.

Born in Oberlin, Ohio, the youngest of eight children, she graduated from Oberlin High School at sixteen and from Oberlin College in 1886—the only African American woman in her graduating class. She entered education, becoming assistant principal at Union High School in Little Rock, Arkansas, the highest position held by an African American woman in the state.

In 1891, she married William H. Talbert and moved to Buffalo, joining Michigan Avenue Baptist Church. In 1905, she secretly hosted W.E.B. Du Bois, John Hope, and nearly thirty others at her dining room table for the first meeting of what became the Niagara Movement, forerunner to the NAACP.

Talbert co-founded Buffalo's first NAACP chapter in 1910 and chapters in Texas and Louisiana. She served on the NAACP's national board and as vice president from 1919 until her death. In 1921, she became national director of the organization's anti-lynching campaign.

In 1916, she was elected President of the National Association of Colored Women. In 1922, she became the first woman awarded the NAACP's prestigious Spingarn Medal and led the purchase and restoration of Frederick Douglass's home in Anacostia.

She was inducted into the National Women's Hall of Fame in 2005.`
  },
  {
    name: 'Dr. Roswell Park',
    title: 'Founder of Roswell Park Cancer Institute',
    birth_date: '1852-05-04',
    death_date: '1914-02-15',
    birth_place: 'Pomfret, Connecticut',
    death_place: 'Buffalo, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Roswell_Park.png',
    bio: `Dr. Roswell Park was an American physician, surgeon, and cancer researcher who founded the world's first cancer research center, now known as Roswell Park Comprehensive Cancer Center.

Born into a prominent family that arrived in America on the Mayflower, Park received his B.A. from Racine College in Wisconsin in 1872 and his Doctor of Medicine from Northwestern University in 1876. After his internship at Cook County Hospital in Chicago, he began teaching at the Women's Medical College of Chicago and Northwestern University.

In 1883, Park came to Buffalo at age thirty-one and served as professor of surgery at the University at Buffalo Medical School and chief surgeon at Buffalo General Hospital for thirty-one years until his death.

Park was a pioneer in neurosurgery, becoming one of the first American surgeons to successfully treat spina bifida and the first to precisely localize and remove a posttraumatic epileptic focus in 1886. He was an early champion of sterile surgical environments when germ theory was still new.

In 1898, Park founded Gratwick Research Laboratory, completed in 1901 as the first facility in the world built and equipped solely for cancer research. It evolved into today's Roswell Park Comprehensive Cancer Center.

Park was instrumental in designing the Hospital Building at the 1901 Pan-American Exposition in Buffalo, though he was in Niagara Falls when President McKinley was shot there.`
  },
  {
    name: 'John D. Larkin',
    title: 'Founder of Larkin Soap Company',
    birth_date: '1845-09-29',
    death_date: '1926-02-15',
    birth_place: 'Buffalo, New York',
    death_place: 'Buffalo, New York',
    main_photo: 'https://upload.wikimedia.org/wikipedia/commons/8/8b/John_D._Larkin.jpg',
    bio: `John Durrant Larkin was an American business magnate who built one of Buffalo's greatest commercial empires and pioneered revolutionary business practices that shaped American commerce.

Born in Buffalo, Larkin lost his father at age seven, leaving his mother to struggle with six children. He attended Buffalo public schools and began working at age twelve as a Western Union telegraph messenger. In 1862, he started work in his brother-in-law's soap factory.

In 1875, Larkin returned to Buffalo and founded J. D. Larkin, Manufacturer of Plain and Fancy Soaps, starting with a single product: Sweet Home Soap. With his business partner and brother-in-law Elbert Hubbard, Larkin pioneered the mail-order business model and developed the revolutionary marketing strategy of offering premiums to customers.

The Larkin Company grew to employ thousands and introduced progressive employment innovations. In 1901, Larkin founded Buffalo Pottery to supply dinnerware premiums, building the largest fireproof pottery plant in the world by 1903.

In 1904, Larkin commissioned Frank Lloyd Wright to design the Larkin Administration Building, Wright's first major public work and a landmark of modern architecture.

Larkin was a generous benefactor, donating $250,000 to the University of Buffalo by 1926. He died as one of Buffalo's most respected citizens. The Larkin Company continued until 1967, and the Larkin District remains an important part of Buffalo's commercial landscape.`
  }
];

async function enrichMemorials() {
  console.log('Enriching Forest Lawn famous people memorials...\n');

  for (const memorial of memorials) {
    const { data, error } = await supabase
      .from('memorials')
      .update({
        title: memorial.title,
        birth_date: memorial.birth_date,
        death_date: memorial.death_date,
        birth_place: memorial.birth_place,
        death_place: memorial.death_place,
        main_photo: memorial.main_photo,
        bio: memorial.bio,
        status: 'published'
      })
      .eq('name', memorial.name)
      .ilike('cemetery_name', '%forest lawn%')
      .select('id, name');

    if (error) {
      console.error(`Error updating ${memorial.name}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`✓ ${memorial.name} - ${memorial.title}`);
    } else {
      console.log(`✗ Not found: ${memorial.name}`);
    }
  }

  console.log('\nDone!');
}

enrichMemorials().catch(console.error);
