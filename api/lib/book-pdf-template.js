/**
 * Memorial Book PDF Template
 * Uses @react-pdf/renderer to generate print-ready PDFs for Lulu
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font
} from '@react-pdf/renderer';

// Register fonts (using standard fonts for now)
// For production, you might want to register custom fonts

// Styles for the book
const styles = StyleSheet.create({
  // Page setup - 8.5" x 11" with bleed
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 50,
    fontFamily: 'Times-Roman'
  },
  coverPage: {
    flexDirection: 'column',
    backgroundColor: '#1a1a2e',
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  coverPageModern: {
    backgroundColor: '#FFFFFF'
  },
  coverPageNature: {
    backgroundColor: '#2d4a3e'
  },
  coverPageFaith: {
    backgroundColor: '#4a3c6e'
  },

  // Cover elements
  coverPhoto: {
    width: 250,
    height: 320,
    objectFit: 'cover',
    borderRadius: 8,
    marginBottom: 30,
    border: '3px solid #c9a227'
  },
  coverName: {
    fontSize: 36,
    color: '#c9a227',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'Times-Bold'
  },
  coverNameModern: {
    color: '#005F60'
  },
  coverNameNature: {
    color: '#8fbc8f'
  },
  coverNameFaith: {
    color: '#d4af37'
  },
  coverDates: {
    fontSize: 18,
    color: '#cccccc',
    textAlign: 'center'
  },
  coverDatesModern: {
    color: '#666666'
  },

  // Title page
  titlePage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 150
  },
  titleName: {
    fontSize: 42,
    marginBottom: 20,
    textAlign: 'center',
    fontFamily: 'Times-Bold'
  },
  titleDates: {
    fontSize: 24,
    color: '#666666',
    marginBottom: 40
  },
  titleSubtext: {
    fontSize: 14,
    color: '#888888',
    fontStyle: 'italic'
  },

  // Dedication page
  dedicationPage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 200,
    paddingHorizontal: 80
  },
  dedicationText: {
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 1.8,
    color: '#444444'
  },

  // Section headers
  sectionHeader: {
    fontSize: 28,
    marginBottom: 20,
    color: '#005F60',
    borderBottomWidth: 2,
    borderBottomColor: '#005F60',
    paddingBottom: 10,
    fontFamily: 'Times-Bold'
  },

  // Biography
  bioText: {
    fontSize: 12,
    lineHeight: 1.8,
    textAlign: 'justify',
    color: '#333333'
  },
  bioParagraph: {
    marginBottom: 15
  },

  // Timeline
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 15
  },
  timelineYear: {
    width: 70,
    fontSize: 14,
    color: '#005F60',
    fontFamily: 'Times-Bold'
  },
  timelineEvent: {
    flex: 1,
    fontSize: 12,
    color: '#333333'
  },

  // Photo gallery
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  photoItem: {
    width: '48%',
    marginBottom: 20
  },
  photoImage: {
    width: '100%',
    height: 200,
    objectFit: 'cover'
  },
  photoCaption: {
    fontSize: 10,
    color: '#666666',
    marginTop: 5,
    textAlign: 'center'
  },

  // Family tree
  familySection: {
    marginBottom: 20
  },
  familyRelationship: {
    fontSize: 14,
    color: '#005F60',
    marginBottom: 5,
    fontFamily: 'Times-Bold'
  },
  familyName: {
    fontSize: 12,
    color: '#333333',
    marginLeft: 20,
    marginBottom: 3
  },

  // Tributes
  tributeCard: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    marginBottom: 15,
    borderRadius: 5
  },
  tributeText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#333333',
    marginBottom: 10,
    lineHeight: 1.6
  },
  tributeAuthor: {
    fontSize: 10,
    color: '#666666',
    textAlign: 'right'
  },

  // Residences
  residenceItem: {
    marginBottom: 12
  },
  residenceAddress: {
    fontSize: 12,
    color: '#333333',
    fontFamily: 'Times-Bold'
  },
  residenceYears: {
    fontSize: 11,
    color: '#666666'
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: 'center',
    fontSize: 10,
    color: '#999999'
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 50,
    fontSize: 10,
    color: '#999999'
  },

  // Back cover
  backCover: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e'
  },
  qrCode: {
    width: 150,
    height: 150,
    marginBottom: 20
  },
  backCoverText: {
    color: '#cccccc',
    fontSize: 12,
    textAlign: 'center'
  },
  backCoverUrl: {
    color: '#c9a227',
    fontSize: 10,
    marginTop: 10
  }
});

// Helper to format dates
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatYear(dateStr) {
  if (!dateStr) return '?';
  return new Date(dateStr).getFullYear();
}

// Cover Page Component
function CoverPage({ memorial, template }) {
  const templateStyle = {
    classic: {},
    modern: styles.coverPageModern,
    nature: styles.coverPageNature,
    faith: styles.coverPageFaith
  }[template] || {};

  const nameStyle = {
    classic: {},
    modern: styles.coverNameModern,
    nature: styles.coverNameNature,
    faith: styles.coverNameFaith
  }[template] || {};

  const dateStyle = template === 'modern' ? styles.coverDatesModern : {};

  return (
    <Page size="LETTER" style={[styles.coverPage, templateStyle]}>
      {memorial.main_photo && (
        <Image src={memorial.main_photo} style={styles.coverPhoto} />
      )}
      <Text style={[styles.coverName, nameStyle]}>{memorial.name}</Text>
      <Text style={[styles.coverDates, dateStyle]}>
        {formatYear(memorial.birth_date)} — {formatYear(memorial.death_date)}
      </Text>
    </Page>
  );
}

// Title Page Component
function TitlePage({ memorial }) {
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.titlePage}>
        <Text style={styles.titleName}>{memorial.name}</Text>
        <Text style={styles.titleDates}>
          {formatDate(memorial.birth_date)} — {formatDate(memorial.death_date)}
        </Text>
        <Text style={styles.titleSubtext}>A Life Remembered</Text>
      </View>
    </Page>
  );
}

// Dedication Page Component
function DedicationPage({ dedication }) {
  if (!dedication) return null;

  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.dedicationPage}>
        <Text style={styles.dedicationText}>{dedication}</Text>
      </View>
    </Page>
  );
}

// Biography Page(s) Component
function BiographyPages({ biography }) {
  if (!biography) return null;

  // Split biography into paragraphs
  const paragraphs = biography.split('\n\n').filter(p => p.trim());

  return (
    <Page size="LETTER" style={styles.page} wrap>
      <Text style={styles.sectionHeader}>Life Story</Text>
      {paragraphs.map((para, idx) => (
        <View key={idx} style={styles.bioParagraph}>
          <Text style={styles.bioText}>{para}</Text>
        </View>
      ))}
      <Text style={styles.pageNumber} render={({ pageNumber }) => pageNumber} fixed />
    </Page>
  );
}

// Timeline Page Component
function TimelinePage({ timeline }) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.sectionHeader}>Timeline</Text>
      {timeline.map((event, idx) => (
        <View key={idx} style={styles.timelineItem}>
          <Text style={styles.timelineYear}>{event.year || event.date}</Text>
          <Text style={styles.timelineEvent}>{event.event || event.description}</Text>
        </View>
      ))}
      <Text style={styles.pageNumber} render={({ pageNumber }) => pageNumber} fixed />
    </Page>
  );
}

// Photo Gallery Pages Component
function GalleryPages({ photos }) {
  if (!photos || photos.length === 0) return null;

  // Group photos into pages (4 per page)
  const photosPerPage = 4;
  const pages = [];
  for (let i = 0; i < photos.length; i += photosPerPage) {
    pages.push(photos.slice(i, i + photosPerPage));
  }

  return pages.map((pagePhotos, pageIdx) => (
    <Page key={pageIdx} size="LETTER" style={styles.page}>
      {pageIdx === 0 && <Text style={styles.sectionHeader}>Photo Gallery</Text>}
      <View style={styles.photoGrid}>
        {pagePhotos.map((photo, idx) => (
          <View key={idx} style={styles.photoItem}>
            <Image src={typeof photo === 'string' ? photo : photo.url} style={styles.photoImage} />
            {photo.caption && <Text style={styles.photoCaption}>{photo.caption}</Text>}
          </View>
        ))}
      </View>
      <Text style={styles.pageNumber} render={({ pageNumber }) => pageNumber} fixed />
    </Page>
  ));
}

// Family Page Component
function FamilyPage({ familyConnections }) {
  if (!familyConnections || familyConnections.length === 0) return null;

  // Group by relationship type
  const grouped = familyConnections.reduce((acc, conn) => {
    const rel = conn.relationship_type || 'Family';
    if (!acc[rel]) acc[rel] = [];
    acc[rel].push(conn);
    return acc;
  }, {});

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.sectionHeader}>Family</Text>
      {Object.entries(grouped).map(([relationship, members]) => (
        <View key={relationship} style={styles.familySection}>
          <Text style={styles.familyRelationship}>
            {relationship.charAt(0).toUpperCase() + relationship.slice(1)}
          </Text>
          {members.map((member, idx) => (
            <Text key={idx} style={styles.familyName}>
              {member.related_memorial_name || member.name}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.pageNumber} render={({ pageNumber }) => pageNumber} fixed />
    </Page>
  );
}

// Residences Page Component
function ResidencesPage({ residences }) {
  if (!residences || residences.length === 0) return null;

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.sectionHeader}>Places Called Home</Text>
      {residences.map((residence, idx) => (
        <View key={idx} style={styles.residenceItem}>
          <Text style={styles.residenceAddress}>{residence.address}</Text>
          <Text style={styles.residenceYears}>
            {residence.startYear || '?'} — {residence.endYear || 'Present'}
          </Text>
        </View>
      ))}
      <Text style={styles.pageNumber} render={({ pageNumber }) => pageNumber} fixed />
    </Page>
  );
}

// Tributes Page(s) Component
function TributesPages({ tributes }) {
  if (!tributes || tributes.length === 0) return null;

  return (
    <Page size="LETTER" style={styles.page} wrap>
      <Text style={styles.sectionHeader}>Tributes & Memories</Text>
      {tributes.map((tribute, idx) => (
        <View key={idx} style={styles.tributeCard} wrap={false}>
          <Text style={styles.tributeText}>"{tribute.message}"</Text>
          <Text style={styles.tributeAuthor}>— {tribute.author_name || 'Anonymous'}</Text>
        </View>
      ))}
      <Text style={styles.pageNumber} render={({ pageNumber }) => pageNumber} fixed />
    </Page>
  );
}

// Back Cover Component
function BackCover({ memorial, qrCodeUrl }) {
  return (
    <Page size="LETTER" style={[styles.coverPage, styles.backCover]}>
      {qrCodeUrl && <Image src={qrCodeUrl} style={styles.qrCode} />}
      <Text style={styles.backCoverText}>
        Scan to visit the online memorial
      </Text>
      <Text style={styles.backCoverUrl}>
        www.headstonelegacy.com/memorial?id={memorial.id}
      </Text>
    </Page>
  );
}

/**
 * Main Book Document Component
 */
export function MemorialBookDocument({
  memorial,
  tributes = [],
  familyConnections = [],
  options = {}
}) {
  const {
    coverTemplate = 'classic',
    dedicationText = null,
    includeGallery = true,
    includeTimeline = true,
    includeFamily = true,
    includeResidences = true,
    includeTributes = true,
    qrCodeUrl = null
  } = options;

  return (
    <Document
      title={`${memorial.name} - Memorial Book`}
      author="Headstone Legacy"
      subject="Memorial Book"
      creator="Headstone Legacy - www.headstonelegacy.com"
    >
      <CoverPage memorial={memorial} template={coverTemplate} />
      <TitlePage memorial={memorial} />
      {dedicationText && <DedicationPage dedication={dedicationText} />}
      <BiographyPages biography={memorial.bio} />
      {includeTimeline && <TimelinePage timeline={memorial.milestones} />}
      {includeGallery && <GalleryPages photos={memorial.photos} />}
      {includeFamily && familyConnections.length > 0 && (
        <FamilyPage familyConnections={familyConnections} />
      )}
      {includeResidences && <ResidencesPage residences={memorial.residences} />}
      {includeTributes && tributes.length > 0 && <TributesPages tributes={tributes} />}
      <BackCover memorial={memorial} qrCodeUrl={qrCodeUrl} />
    </Document>
  );
}

export default MemorialBookDocument;
