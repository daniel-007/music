import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit } from '@angular/core';
import { map } from 'rxjs/operators';

import { Provider, RankGQL, RankType, SongDetail } from '../graphql/generated';
import { PlayerService } from '../services/player.service';

@Component({
  selector: 'app-song-list',
  templateUrl: './song-list.component.html',
  styleUrls: ['./song-list.component.scss'],
})
export class SongListComponent implements OnInit {
  public playList: SongDetail[];

  private songRetryNu = 0;
  private songListRetryNu = 0;
  private MAX_SONG_RETRY = 1;
  private MAX_SONG_LIST_RETRY = 2;
  private mode = '1';

  constructor(private playerService: PlayerService, private rankGQL: RankGQL) {}

  ngOnInit() {
    this.getSongList();

    this.playerService.endedSubject.subscribe(() => {
      console.info('endedSubject emit');
      this.playerService.next();

      this.songRetryNu = 0;
      this.songListRetryNu = 0;
    });

    this.playerService.layoutTouchSubject.subscribe(async () => {
      this.playerService.layOutPause();
    });

    this.playerService.errorSubject.subscribe((e) => {
      console.warn(e);
      if (this.songListRetryNu >= this.MAX_SONG_LIST_RETRY * this.playerService.songList.length) {
        throw new Error('song list retry over ' + this.MAX_SONG_LIST_RETRY);
      }

      if (this.songRetryNu >= this.MAX_SONG_RETRY) {
        console.warn('song retryNu = ' + this.songRetryNu);
        this.songRetryNu = 0;
        this.songListRetryNu += 1;
        setTimeout(() => {
          this.playerService.next();
        }, this.songListRetryNu * 200);
        return null;
      }

      this.songRetryNu += 1;
      this.playerService.playCurrent();
    });

    this.playerService.songListChangeSubject.subscribe(() => {
      console.info('songListChangeSubject');
      this.saveSongList();
    });
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.playList, event.previousIndex, event.currentIndex);
  }

  play(index: number) {
    this.playerService.playAt(index);
  }

  remove(index: number) {
    this.playerService.remove(index);
    this.saveSongList();
  }

  getSongList() {
    if (this.mode === 'rank') {
      this.getRankList();
      return;
    }

    let key = `songs-${this.mode}`;
    try {
      this.playerService.songList.length = 0;
      this.playerService.songList.push(...(JSON.parse(localStorage.getItem(key)) || []));
    } catch (e) {
      this.playerService.songList.length = 0;
    }

    this.playList = this.playerService.songList;
  }

  saveSongList() {
    let key = `songs-${this.mode}`;
    localStorage.setItem(key, JSON.stringify(this.playerService.songList));
  }

  getRankList() {
    this.rankGQL
      .fetch({
        provider: Provider.xiami,
        rankType: RankType.hot,
      })
      .pipe(
        map((result) => {
          return result.data.rank;
        })
      )
      .subscribe((songList) => {
        console.info('songList: ', songList);
        this.playerService.songList.length = 0;
        this.playerService.songList.push(...(songList as SongDetail[]));
        this.playList = this.playerService.songList;
      });
  }
}
