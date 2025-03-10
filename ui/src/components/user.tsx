import { Component, linkEvent } from 'inferno';
import { Link } from 'inferno-router';
import { Subscription } from "rxjs";
import { retryWhen, delay, take } from 'rxjs/operators';
import { UserOperation, Post, Comment, CommunityUser, GetUserDetailsForm, SortType, UserDetailsResponse, UserView, CommentResponse, UserSettingsForm, LoginResponse } from '../interfaces';
import { WebSocketService, UserService } from '../services';
import { msgOp, fetchLimit, routeSortTypeToEnum, capitalizeFirstLetter } from '../utils';
import { PostListing } from './post-listing';
import { CommentNodes } from './comment-nodes';
import { MomentTime } from './moment-time';
import { i18n } from '../i18next';
import { T } from 'inferno-i18next';

enum View {
  Overview, Comments, Posts, Saved
}

interface UserState {
  user: UserView;
  user_id: number;
  username: string;
  follows: Array<CommunityUser>;
  moderates: Array<CommunityUser>;
  comments: Array<Comment>;
  posts: Array<Post>;
  saved?: Array<Post>;
  view: View;
  sort: SortType;
  page: number;
  loading: boolean;
  userSettingsForm: UserSettingsForm;
  userSettingsLoading: boolean;
}

export class User extends Component<any, UserState> {

  private subscription: Subscription;
  private emptyState: UserState = {
    user: {
      id: null,
      name: null,
      fedi_name: null,
      published: null,
      number_of_posts: null,
      post_score: null,
      number_of_comments: null,
      comment_score: null,
      banned: null,
    },
    user_id: null,
    username: null,
    follows: [],
    moderates: [],
    comments: [],
    posts: [],
    loading: true,
    view: this.getViewFromProps(this.props),
    sort: this.getSortTypeFromProps(this.props),
    page: this.getPageFromProps(this.props),
    userSettingsForm: {
      show_nsfw: null,
      auth: null,
    },
    userSettingsLoading: null,
  }

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;

    this.state.user_id = Number(this.props.match.params.id);
    this.state.username = this.props.match.params.username;

    this.subscription = WebSocketService.Instance.subject
    .pipe(retryWhen(errors => errors.pipe(delay(3000), take(10))))
    .subscribe(
      (msg) => this.parseMessage(msg),
        (err) => console.error(err),
        () => console.log('complete')
    );

    this.refetch();
  }

  get isCurrentUser() {
    return UserService.Instance.user && UserService.Instance.user.id == this.state.user.id;
  }

  getViewFromProps(props: any): View {
    return (props.match.params.view) ? 
      View[capitalizeFirstLetter(props.match.params.view)] : 
      View.Overview;
  }

  getSortTypeFromProps(props: any): SortType {
    return (props.match.params.sort) ? 
      routeSortTypeToEnum(props.match.params.sort) : 
      SortType.New;
  }

  getPageFromProps(props: any): number {
    return (props.match.params.page) ? Number(props.match.params.page) : 1;
  }

  componentWillUnmount() {
    this.subscription.unsubscribe();
  }

  // Necessary for back button for some reason
  componentWillReceiveProps(nextProps: any) {
    if (nextProps.history.action == 'POP') {
      this.state = this.emptyState;
      this.state.view = this.getViewFromProps(nextProps);
      this.state.sort = this.getSortTypeFromProps(nextProps);
      this.state.page = this.getPageFromProps(nextProps);
      this.refetch();
    }
  }

  render() {
    return (
      <div class="container">
        {this.state.loading ? 
        <h5><svg class="icon icon-spinner spin"><use xlinkHref="#icon-spinner"></use></svg></h5> : 
        <div class="row">
          <div class="col-12 col-md-8">
            <h5>/u/{this.state.user.name}</h5>
            {this.selects()}
            {this.state.view == View.Overview &&
              this.overview()
            }
            {this.state.view == View.Comments &&
              this.comments()
            }
            {this.state.view == View.Posts &&
              this.posts()
            }
            {this.state.view == View.Saved &&
              this.overview()
            }
            {this.paginator()}
          </div>
          <div class="col-12 col-md-4">
            {this.userInfo()}
            {this.isCurrentUser &&
              this.userSettings()
            }
            {this.moderates()}
            {this.follows()}
          </div>
        </div>
        }
      </div>
    )
  }

  selects() {
    return (
      <div className="mb-2">
        <select value={this.state.view} onChange={linkEvent(this, this.handleViewChange)} class="custom-select custom-select-sm w-auto">
          <option disabled><T i18nKey="view">#</T></option>
          <option value={View.Overview}><T i18nKey="overview">#</T></option>
          <option value={View.Comments}><T i18nKey="comments">#</T></option>
          <option value={View.Posts}><T i18nKey="posts">#</T></option>
          <option value={View.Saved}><T i18nKey="saved">#</T></option>
        </select>
        <select value={this.state.sort} onChange={linkEvent(this, this.handleSortChange)} class="custom-select custom-select-sm w-auto ml-2">
          <option disabled><T i18nKey="sort_type">#</T></option>
          <option value={SortType.New}><T i18nKey="new">#</T></option>
          <option value={SortType.TopDay}><T i18nKey="top_day">#</T></option>
          <option value={SortType.TopWeek}><T i18nKey="week">#</T></option>
          <option value={SortType.TopMonth}><T i18nKey="month">#</T></option>
          <option value={SortType.TopYear}><T i18nKey="year">#</T></option>
          <option value={SortType.TopAll}><T i18nKey="all">#</T></option>
        </select>
      </div>
    )

  }

  overview() {
    let combined: Array<{type_: string, data: Comment | Post}> = [];
    let comments = this.state.comments.map(e => {return {type_: "comments", data: e}});
    let posts = this.state.posts.map(e => {return {type_: "posts", data: e}});

    combined.push(...comments);
    combined.push(...posts);

    // Sort it
    if (this.state.sort == SortType.New) {
      combined.sort((a, b) => b.data.published.localeCompare(a.data.published));
    } else {
      combined.sort((a, b) => b.data.score - a.data.score);
    }

    return (
      <div>
        {combined.map(i =>
          <div>
            {i.type_ == "posts"
              ? <PostListing post={i.data as Post} showCommunity viewOnly />
              : <CommentNodes nodes={[{comment: i.data as Comment}]} noIndent />
            }
          </div>
                     )
        }
      </div>
    )
  }

  comments() {
    return (
      <div>
        {this.state.comments.map(comment => 
          <CommentNodes nodes={[{comment: comment}]} noIndent viewOnly />
        )}
      </div>
    );
  }

  posts() {
    return (
      <div>
        {this.state.posts.map(post => 
          <PostListing post={post} showCommunity viewOnly />
        )}
      </div>
    );
  }

  userInfo() {
    let user = this.state.user;
    return (
      <div>
        <div class="card border-secondary mb-3">
          <div class="card-body">
            <h5>
              <ul class="list-inline mb-0">
                <li className="list-inline-item">{user.name}</li>
                {user.banned &&  
                  <li className="list-inline-item badge badge-danger"><T i18nKey="banned">#</T></li>
                }
              </ul>
            </h5>
            <div>{i18n.t('joined')} <MomentTime data={user} /></div>
            <div class="table-responsive">
              <table class="table table-bordered table-sm mt-2 mb-0">
                <tr>
                  <td><T i18nKey="number_of_points" interpolation={{count: user.post_score}}>#</T></td>
                  <td><T i18nKey="number_of_posts" interpolation={{count: user.number_of_posts}}>#</T></td>
                </tr>
                <tr>
                  <td><T i18nKey="number_of_points" interpolation={{count: user.comment_score}}>#</T></td>
                  <td><T i18nKey="number_of_comments" interpolation={{count: user.number_of_comments}}>#</T></td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  userSettings() {  
    return (
      <div>
        <div class="card border-secondary mb-3">
          <div class="card-body">
            <h5><T i18nKey="settings">#</T></h5>
            <form onSubmit={linkEvent(this, this.handleUserSettingsSubmit)}>
              <div class="form-group row">
                <div class="col-12">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" checked={this.state.userSettingsForm.show_nsfw} onChange={linkEvent(this, this.handleUserSettingsShowNsfwChange)}/>
                    <label class="form-check-label"><T i18nKey="show_nsfw">#</T></label>
                  </div>
                </div>
              </div>
              <div class="form-group row mb-0">
                <div class="col-12">
                  <button type="submit" class="btn btn-secondary">{this.state.userSettingsLoading ? 
                  <svg class="icon icon-spinner spin"><use xlinkHref="#icon-spinner"></use></svg> : capitalizeFirstLetter(i18n.t('save'))}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  moderates() {
    return (
      <div>
        <div class="card border-secondary mb-3">
          <div class="card-body">
            {this.state.moderates.length > 0 &&
              <div>
                <h5><T i18nKey="moderates">#</T></h5>
                <ul class="list-unstyled mb-0"> 
                  {this.state.moderates.map(community =>
                    <li><Link to={`/c/${community.community_name}`}>{community.community_name}</Link></li>
                  )}
                </ul>
              </div>
            }
          </div>
        </div>
      </div>
    )
  }

  follows() {
    return (
      <div>
        {this.state.follows.length > 0 &&
          <div class="card border-secondary mb-3">
            <div class="card-body">
              <h5><T i18nKey="subscribed">#</T></h5>
              <ul class="list-unstyled mb-0"> 
                {this.state.follows.map(community =>
                  <li><Link to={`/c/${community.community_name}`}>{community.community_name}</Link></li>
                )}
              </ul>
            </div>
          </div>
        }
      </div>
    )
  }

  paginator() {
    return (
      <div class="my-2">
        {this.state.page > 1 && 
          <button class="btn btn-sm btn-secondary mr-1" onClick={linkEvent(this, this.prevPage)}><T i18nKey="prev">#</T></button>
        }
        <button class="btn btn-sm btn-secondary" onClick={linkEvent(this, this.nextPage)}><T i18nKey="next">#</T></button>
      </div>
    );
  }

  updateUrl() {
    let viewStr = View[this.state.view].toLowerCase();
    let sortStr = SortType[this.state.sort].toLowerCase();
    this.props.history.push(`/u/${this.state.user.name}/view/${viewStr}/sort/${sortStr}/page/${this.state.page}`);
  }

  nextPage(i: User) { 
    i.state.page++;
    i.setState(i.state);
    i.updateUrl();
    i.refetch();
  }

  prevPage(i: User) { 
    i.state.page--;
    i.setState(i.state);
    i.updateUrl();
    i.refetch();
  }

  refetch() {
    let form: GetUserDetailsForm = {
      user_id: this.state.user_id,
      username: this.state.username,
      sort: SortType[this.state.sort],
      saved_only: this.state.view == View.Saved,
      page: this.state.page,
      limit: fetchLimit,
    };
    WebSocketService.Instance.getUserDetails(form);
  }

  handleSortChange(i: User, event: any) {
    i.state.sort = Number(event.target.value);
    i.state.page = 1;
    i.setState(i.state);
    i.updateUrl();
    i.refetch();
  }

  handleViewChange(i: User, event: any) {
    i.state.view = Number(event.target.value);
    i.state.page = 1;
    i.setState(i.state);
    i.updateUrl();
    i.refetch();
  }

  handleUserSettingsShowNsfwChange(i: User, event: any) {
    i.state.userSettingsForm.show_nsfw = event.target.checked;
    i.setState(i.state);
  }

  handleUserSettingsSubmit(i: User, event: any) {
    event.preventDefault();
    i.state.userSettingsLoading = true;
    i.setState(i.state);

    WebSocketService.Instance.saveUserSettings(i.state.userSettingsForm);
  }

  parseMessage(msg: any) {
    console.log(msg);
    let op: UserOperation = msgOp(msg);
    if (msg.error) {
      alert(i18n.t(msg.error));
      return;
    } else if (op == UserOperation.GetUserDetails) {
      let res: UserDetailsResponse = msg;
      this.state.user = res.user;
      this.state.comments = res.comments;
      this.state.follows = res.follows;
      this.state.moderates = res.moderates;
      this.state.posts = res.posts;
      this.state.loading = false;
      if (this.isCurrentUser) {
        this.state.userSettingsForm.show_nsfw = UserService.Instance.user.show_nsfw;
      }
      document.title = `/u/${this.state.user.name} - ${WebSocketService.Instance.site.name}`;
      window.scrollTo(0,0);
      this.setState(this.state);
    } else if (op == UserOperation.EditComment) {
      let res: CommentResponse = msg;

      let found = this.state.comments.find(c => c.id == res.comment.id);
      found.content = res.comment.content;
      found.updated = res.comment.updated;
      found.removed = res.comment.removed;
      found.deleted = res.comment.deleted;
      found.upvotes = res.comment.upvotes;
      found.downvotes = res.comment.downvotes;
      found.score = res.comment.score;

      this.setState(this.state);
    } else if (op == UserOperation.CreateComment) {
      // let res: CommentResponse = msg;
      alert(i18n.t('reply_sent'));
      // this.state.comments.unshift(res.comment); // TODO do this right
      // this.setState(this.state);
    } else if (op == UserOperation.SaveComment) {
      let res: CommentResponse = msg;
      let found = this.state.comments.find(c => c.id == res.comment.id);
      found.saved = res.comment.saved;
      this.setState(this.state);
    } else if (op == UserOperation.CreateCommentLike) {
      let res: CommentResponse = msg;
      let found: Comment = this.state.comments.find(c => c.id === res.comment.id);
      found.score = res.comment.score;
      found.upvotes = res.comment.upvotes;
      found.downvotes = res.comment.downvotes;
      if (res.comment.my_vote !== null) 
        found.my_vote = res.comment.my_vote;
      this.setState(this.state);
    } else if (op == UserOperation.SaveUserSettings) {
        this.state = this.emptyState;
        this.state.userSettingsLoading = false;
        this.setState(this.state);
        let res: LoginResponse = msg;
        UserService.Instance.login(res);
    }
  }
}

