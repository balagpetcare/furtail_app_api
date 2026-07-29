import { AdoptionStore } from '../../../src/modules/adoption/adoption-store';

describe('AdoptionStore', () => {
  let store: AdoptionStore;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      adoptionListing: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      media: {
        findMany: jest.fn(),
      },
      bdArea: {
        findUnique: jest.fn(),
      },
      bdUnion: {
        findUnique: jest.fn(),
      },
      bdUpazila: {
        findUnique: jest.fn(),
      },
    };
    store = new AdoptionStore(mockPrisma as any);
  });

  function buildListing(extra: Record<string, unknown> = {}) {
    return {
      id: 42,
      ownerUserId: 7,
      status: 'PUBLISHED',
      petName: 'Luna',
      animalTypeId: 1,
      breedId: 2,
      sex: 'FEMALE',
      ageText: '1 year',
      size: 'Medium',
      colors: 'Brown',
      story: 'Friendly',
      adoptionReason: 'Need a home',
      vaccinated: true,
      dewormed: true,
      neutered: false,
      microchipped: false,
      healthInfo: 'Healthy',
      countryId: 1,
      bdDivisionId: null,
      bdDistrictId: null,
      bdAddressMode: null,
      bdCityCorporationId: null,
      bdZoneId: null,
      bdWardId: null,
      bdUpazilaId: null,
      bdUnionId: null,
      bdAreaId: null,
      ownerCityAreaText: 'Dhaka',
      latitude: null,
      longitude: null,
      serviceAreaType: 'LOCAL',
      serviceAreaNotes: null,
      ownerContactPhone: '0123456789',
      ownerWhatsappPhone: null,
      pickupLocationNotes: null,
      mediaIds: [11],
      createdAt: new Date('2026-07-27T00:00:00.000Z'),
      ownerUser: {
        id: 7,
        profile: {
          displayName: 'Owner Seven',
          username: 'ownerseven',
          avatarMedia: null,
          coverMedia: null,
        },
      },
      animalType: { id: 1, name: 'Dog', code: 'DOG' },
      breed: { id: 2, name: 'Mixed' },
      country: { id: 1, name: 'Bangladesh', iso2: 'BD' },
      bdDivision: null,
      bdDistrict: null,
      bdUpazila: null,
      bdArea: null,
      ...extra,
    };
  }

  it('should create a draft idempotently', async () => {
    const input = { petName: 'Fluffy' };
    mockPrisma.adoptionListing.findUnique.mockResolvedValueOnce(null);
    mockPrisma.adoptionListing.create.mockResolvedValueOnce({ id: 1, ...input, status: 'DRAFT' });

    const draft = await store.createDraft(1, input, 'idem-123');
    expect(draft).toBeDefined();
    expect(mockPrisma.adoptionListing.create).toHaveBeenCalled();
  });

  it('should return existing draft if idempotency key matches', async () => {
    const existing = { id: 1, petName: 'Fluffy', status: 'DRAFT' };
    mockPrisma.adoptionListing.findUnique.mockResolvedValueOnce(existing);

    const draft = await store.createDraft(1, { petName: 'New' }, 'idem-123');
    expect(draft.petName).toBe('Fluffy');
    expect(mockPrisma.adoptionListing.create).not.toHaveBeenCalled();
  });

  it('rejects media that is already attached to another adoption listing when creating a draft', async () => {
    mockPrisma.adoptionListing.findFirst.mockResolvedValueOnce({ id: 99 });

    await expect(
      store.createDraft(1, { petName: 'Fluffy', mediaIds: [11, 12] }, 'idem-123'),
    ).rejects.toMatchObject({
      code: 'ADOPTION_MEDIA_ALREADY_BOUND',
      statusCode: 409,
      message: 'One or more media items are already attached to another adoption listing',
    });
    expect(mockPrisma.adoptionListing.create).not.toHaveBeenCalled();
  });

  it('rejects cross-listing media reuse on update with a typed adoption media error', async () => {
    mockPrisma.adoptionListing.findUnique.mockResolvedValueOnce({
      id: 1,
      ownerUserId: 1,
      status: 'DRAFT',
    });
    mockPrisma.adoptionListing.findFirst.mockResolvedValueOnce({ id: 2 });

    await expect(
      store.updateListing(1, 1, { mediaIds: [21] }),
    ).rejects.toMatchObject({
      code: 'ADOPTION_MEDIA_ALREADY_BOUND',
      statusCode: 409,
    });
    expect(mockPrisma.adoptionListing.update).not.toHaveBeenCalled();
  });

  it('publishes only public listings and resolves media from the shared media lookup when the media table is empty', async () => {
    const listing = buildListing();
    mockPrisma.adoptionListing.findMany.mockResolvedValueOnce([listing]);
    mockPrisma.media.findMany.mockResolvedValueOnce([]);
    mockPrisma.bdArea.findUnique = jest.fn().mockResolvedValue(null);
    mockPrisma.bdUnion.findUnique = jest.fn().mockResolvedValue(null);
    mockPrisma.bdUpazila.findUnique = jest.fn().mockResolvedValue(null);

    const storeWithLookup = new AdoptionStore(mockPrisma as any, {
      getMedia(mediaId: number) {
        if (mediaId !== 11) return null;
        return {
          id: 11,
          url: 'https://cdn.example.test/adoption/11.jpg',
          thumbnailUrl: 'https://cdn.example.test/adoption/11-thumb.jpg',
          hlsUrl: null,
          type: 'IMAGE',
          mimeType: 'image/jpeg',
        };
      },
    });

    const items = await storeWithLookup.listPublic({}, 0);

    expect(mockPrisma.adoptionListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PUBLISHED' },
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.coverImageUrl).toBe('https://cdn.example.test/adoption/11-thumb.jpg');
    expect(items[0]?.galleryImageUrls).toEqual(['https://cdn.example.test/adoption/11.jpg']);
    expect(items[0]?.media).toHaveLength(1);
    expect(items[0]?.media[0]?.media?.url).toBe('https://cdn.example.test/adoption/11.jpg');
  });
});
