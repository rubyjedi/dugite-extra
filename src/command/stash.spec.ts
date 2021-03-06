import * as temp from 'temp';
import { createTestRepository, modify, contentIsEqual } from './test-helper';
import { stash } from './stash';
import { getStatus } from './status';
import { expect } from 'chai';
import { WorkingDirectoryFileChange } from '../model/status';
import { fail } from 'assert';

const track = temp.track();

describe('stash', async () => {

    let repositoryPath: string;
    const testText = 'A modified';
    const testText2 = 'This is a completely different text.';

    afterEach(async () => {
        track.cleanupSync();
    });

    beforeEach(async () => {
        repositoryPath = await createTestRepository(track.mkdirSync());
    })

    describe('stash', async () => {
        it('push', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });

            let files: ReadonlyArray<WorkingDirectoryFileChange>;
            const beforeStatus = await getStatus(repositoryPath);
            files = beforeStatus.workingDirectory.files;
            expect(files).to.have.lengthOf(1);

            await stash.push(repositoryPath);

            const afterStatus = await getStatus(repositoryPath);
            files = afterStatus.workingDirectory.files;

            expect(files).to.have.lengthOf(0);
        });

        it('list', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            let stashes: string[] = [];
            stashes = await stash.list(repositoryPath);
            expect(stashes).to.have.lengthOf(1);
        });

        it('apply latest', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText2 });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);

            await stash.apply(repositoryPath);

            const afterStatus = await getStatus(repositoryPath);
            let files = afterStatus.workingDirectory.files;
            expect(files).to.have.lengthOf(1);
            expect(contentIsEqual(repositoryPath, files[0].path, testText)).to.equal(true);
        });

        it('stash with a message', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            await stash.push(repositoryPath, 'This is a stash message.');

            const afterStatus = await getStatus(repositoryPath);
            let files = afterStatus.workingDirectory.files;
            expect(files).to.have.lengthOf(0);

            let stashes: string[] = [];
            stashes = await stash.list(repositoryPath);
            expect(stashes).to.have.lengthOf(2);
            expect(stashes[0]).contains('This is a stash message.');
        });

        it('apply by id', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            await stash.push(repositoryPath, 'This is a stash message.');

            await stash.apply(repositoryPath, 'stash@{1}');

            const afterStatus = await getStatus(repositoryPath);
            let files = afterStatus.workingDirectory.files;
            expect(files).to.have.lengthOf(1);
            expect(contentIsEqual(repositoryPath, files[0].path, testText)).to.equal(true);
        });

        it('pop latest', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            await stash.push(repositoryPath, 'This is a stash message.');
            modify(repositoryPath, { path: 'A.txt', data: testText2 });
            try {
                await stash.pop(repositoryPath);
                fail();
            } catch (error) {
                expect(error.message).contains('Your local changes to the following files would be overwritten');
            } finally {
                await stash.push(repositoryPath);
                await stash.pop(repositoryPath);

                const afterStatus = await getStatus(repositoryPath);
                let files = afterStatus.workingDirectory.files;

                expect(files).to.have.lengthOf(1);
                expect(contentIsEqual(repositoryPath, files[0].path, testText2)).to.equal(true);

                const stashes = await stash.list(repositoryPath);
                expect(stashes).to.have.lengthOf(2);
            }
        });

        it('pop by id', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: testText2 });
            await stash.push(repositoryPath, 'This is a stash message.');
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            try {
                await stash.pop(repositoryPath, 'stash@{0}');
                fail();
            } catch (error) {
                expect(error.message).contains('Your local changes to the following files would be overwritten');
            } finally {
                await stash.push(repositoryPath);
                await stash.pop(repositoryPath, 'stash@{1}');

                const afterStatus = await getStatus(repositoryPath);
                let files = afterStatus.workingDirectory.files;

                expect(files).to.have.lengthOf(1);
                expect(contentIsEqual(repositoryPath, files[0].path, testText2)).to.equal(true);

                const stashes = await stash.list(repositoryPath);
                expect(stashes).to.have.lengthOf(2);
            }
        });

        it('drop latest', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: testText2 });
            await stash.push(repositoryPath, 'This is a stash message.');
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            await stash.push(repositoryPath);

            await stash.drop(repositoryPath);

            const stashes = await stash.list(repositoryPath);
            expect(stashes).to.have.lengthOf(2);
        });

        it('drop by id', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: testText2 });
            await stash.push(repositoryPath, 'This is a stash message.');
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            await stash.push(repositoryPath);

            await stash.drop(repositoryPath, 'stash@{1}');

            const stashes = await stash.list(repositoryPath);
            expect(stashes).to.have.lengthOf(2);
        });

        it('clear', async () => {
            modify(repositoryPath, { path: 'A.txt', data: testText });
            await stash.push(repositoryPath);
            modify(repositoryPath, { path: 'A.txt', data: testText2 });
            await stash.push(repositoryPath, 'This is a stash message.');
            modify(repositoryPath, { path: 'A.txt', data: 'B' });
            await stash.push(repositoryPath);

            let stashes = await stash.list(repositoryPath);
            expect(stashes).to.have.lengthOf(3);

            await stash.clear(repositoryPath);

            stashes = await stash.list(repositoryPath);
            expect(stashes).to.have.lengthOf(0);
        })
    })
})