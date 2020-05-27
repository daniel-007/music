import { Injectable } from '@nestjs/common';
import get from 'lodash/get';
import request from 'request';
import rp from 'request-promise';

import { SearchSong } from '../song/fields/SearchSong';
import { MusicApiService } from '../song/music-api.service';
import { Provider } from '../song/register-type';

enum Privilege {
  allow = 'allow',
  deny = 'deny',
  audition = 'audition',
  unknown = 'unknown',
}

@Injectable()
export class KugouUrlParseService {
  supportedUrlReg = {
    rawShare: /^https?:\/\/\w+\.kugou\.com\/song\.html\?id=(\w+)$/,
    chainShare: /https?:\/\/m\.kugou\.com\/share\/\?chain=(\w+)/,
    zlistShare: /https?:\/\/\w+\.kugou\.com\/share\/zlist.html/,
    userListShare: /https?:\/\/\w+\.kugou\.com\/\w+/,
  };

  private client: request.RequestAPI<
    rp.RequestPromise,
    rp.RequestPromiseOptions,
    request.RequiredUriUrl
  >;

  constructor(private readonly musicApiService: MusicApiService) {
    this.client = rp.defaults({
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 5.0; SM-G900P Build/LRX21T) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.80 Mobile Safari/537.36',
      },
    });
  }

  private static getPrivilege(data: any): Privilege {
    const privilege = get(data, 'data.privilege', 0);

    if (privilege === 5) {
      return Privilege.deny;
    }

    if (privilege === 8) {
      return Privilege.audition;
    }

    if (privilege === 0) {
      return Privilege.allow;
    }

    return Privilege.unknown;
  }

  async rawShare(url: string): Promise<SearchSong[]> {
    if (!this.supportedUrlReg.rawShare.test(url)) {
      throw new Error('not match rawShare');
    }

    const newUrl = `http://m.kugou.com/share/?chain=${RegExp.$1}&id=${RegExp.$1}`;
    return this.chainShare(newUrl);
  }

  async chainShare(url: string): Promise<SearchSong[]> {
    if (!this.supportedUrlReg.chainShare.test(url)) {
      throw new Error('not match chainShare');
    }

    const { specialId, albumId } = await this.getPlaylistId(url);
    if (specialId) {
      return await this.musicApiService.playlist(Provider.kugou, specialId);
    }

    if (albumId) {
      return await this.musicApiService.album(Provider.kugou, albumId);
    }

    throw new Error('not match parse chain');
  }

  async userListShare(url: string): Promise<SearchSong[]> {
    if (!this.supportedUrlReg.userListShare.test(url)) {
      throw new Error('not match userListShare');
    }

    return await this.getUserSongList(url);
  }

  async zlistShare(url: string): Promise<SearchSong[]> {
    if (!this.supportedUrlReg.zlistShare.test(url)) {
      throw new Error('not match zlistShare');
    }

    const html = await this.client({ url });

    if (/var\s+dataFromSmarty\s*=\s*(\[[^\]]+\])/.test(html)) {
      const songs = JSON.parse(RegExp.$1);

      return songs.map(item => {
        return {
          privilege: Privilege.unknown,
          provider: Provider.kugou,
          id: item.hash,
          name: (item.song_name || '').trim(),
          artists: `${item.author_name || ''}`
            .trim()
            .split('、')
            .map(name => {
              return {
                name,
              };
            }),
          duration: item.timelength,
        };
      });
    }

    return [];
  }

  private async getPlaylistId(
    url: string,
  ): Promise<
    | {
        specialId: string;
        albumId?: undefined;
      }
    | {
        albumId: string;
        specialId?: undefined;
      }
  > {
    const html = await this.client(url);

    if (/"specialid":(\d+)/.test(html)) {
      return {
        specialId: RegExp.$1,
      };
    }
    if (/"albumid":(\d+)/.test(html)) {
      return {
        albumId: RegExp.$1,
      };
    }

    throw new Error('no special/album id found');
  }

  private async getUserSongList(url: string): Promise<SearchSong[]> {
    let {
      headers: { location },
    } = await this.client(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.87 Safari/537.36',
      },
      followRedirect: false,
      simple: false,
      resolveWithFullResponse: true,
    });

    return this.zlistShare(location);
  }
}
